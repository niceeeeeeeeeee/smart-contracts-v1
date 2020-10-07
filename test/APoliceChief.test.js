const { expectRevert, time } = require('@openzeppelin/test-helpers');
const NiceToken = artifacts.require('NiceToken');
const PoliceChief = artifacts.require('PoliceChief');
const MockERC20 = artifacts.require('MockERC20');

contract('PoliceChief', ([aliceAddress, bobAddress, carolAddress, devAddress, minterAddress]) => {
    beforeEach(async () => {
        this.niceToken = await NiceToken.new({ from: aliceAddress });
        this.defaultBurnDivisor = 100 // 1% burn, changing this will break the tests
        await this.niceToken.setBurnDivisor(this.defaultBurnDivisor, {from: aliceAddress})
    });

    it('should set correct state variables', async () => {
        this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '1000', '0', '1000', { from: aliceAddress });
        await this.niceToken.transferOwnership(this.policeChief.address, { from: aliceAddress });
        const sushi = await this.policeChief.sushi();
        const devaddr = await this.policeChief.devaddr();
        const owner = await this.niceToken.owner();
        assert.equal(sushi.toString(), this.niceToken.address);
        assert.equal(devaddr.toString(), devAddress);
        assert.equal(owner.toString(), this.policeChief.address);
    });

    it('should allow dev and only dev to update dev', async () => {
        this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '1000', '0', '1000', { from: aliceAddress });
        assert.equal((await this.policeChief.devaddr()).toString(), devAddress);
        await expectRevert(this.policeChief.dev(bobAddress, { from: bobAddress }), 'dev: wut?');
        await this.policeChief.dev(bobAddress, { from: devAddress });
        assert.equal((await this.policeChief.devaddr()).toString(), bobAddress);
        await this.policeChief.dev(aliceAddress, { from: bobAddress });
        assert.equal((await this.policeChief.devaddr()).toString(), aliceAddress);

        // this breaks harvesting because can't mint to 0 address
        await expectRevert(this.policeChief.dev('0x0000000000000000000000000000000000000000', { from: aliceAddress }), `dev: don't set to 0 address`);
        await expectRevert(this.niceToken.mint('0x0000000000000000000000000000000000000000', '100', { from: aliceAddress }), `ERC20: mint to the zero address.`);
        await this.niceToken.mint('0x0000000000000000000000000000000000000001', '100')
    })

    context('With ERC/LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minterAddress });
            await this.lp.transfer(aliceAddress, '1000', { from: minterAddress });
            await this.lp.transfer(bobAddress, '1000', { from: minterAddress });
            await this.lp.transfer(carolAddress, '1000', { from: minterAddress });
            this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minterAddress });
            await this.lp2.transfer(aliceAddress, '1000', { from: minterAddress });
            await this.lp2.transfer(bobAddress, '1000', { from: minterAddress });
            await this.lp2.transfer(carolAddress, '1000', { from: minterAddress });
        });

        it('should allow emergency withdraw', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '100', '1000', { from: aliceAddress });
            await this.policeChief.add('100', this.lp.address, true);
            await this.lp.approve(this.policeChief.address, '1000', { from: bobAddress });
            await this.policeChief.deposit(0, '100', { from: bobAddress });
            assert.equal((await this.lp.balanceOf(bobAddress)).toString(), '900');
            await this.policeChief.emergencyWithdraw(0, { from: bobAddress });
            assert.equal((await this.lp.balanceOf(bobAddress)).toString(), '1000');
        });

        it('should not add same pool twice', async () => {
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '100', '1000', { from: aliceAddress });
            await this.policeChief.add('100', this.lp.address, true);
            await this.policeChief.add('100', this.lp2.address, true);
            await expectRevert(
                this.policeChief.add('100', this.lp.address, true),
                'add: pool already added',
            );
        });

        it('should give out SUSHIs only after farming time', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '100', '1000', { from: aliceAddress });
            await this.niceToken.transferOwnership(this.policeChief.address, { from: aliceAddress });
            await this.policeChief.add('100', this.lp.address, true);
            await this.lp.approve(this.policeChief.address, '1000', { from: bobAddress });
            await this.policeChief.deposit(0, '100', { from: bobAddress });
            await time.advanceBlockTo('89');
            await this.policeChief.deposit(0, '0', { from: bobAddress }); // block 90
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '0');
            await time.advanceBlockTo('94');
            await this.policeChief.deposit(0, '0', { from: bobAddress }); // block 95
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '0');
            await time.advanceBlockTo('99');
            await this.policeChief.deposit(0, '0', { from: bobAddress }); // block 100
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '0');
            await time.advanceBlockTo('100');
            await this.policeChief.deposit(0, '0', { from: bobAddress }); // block 101
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '990');
            await time.advanceBlockTo('104');
            await this.policeChief.deposit(0, '0', { from: bobAddress }); // block 105
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '4950');
            assert.equal((await this.niceToken.balanceOf(devAddress)).toString(), '33');
            assert.equal((await this.niceToken.totalSupply()).toString(), '4983');
            assert.equal((await this.niceToken.totalSupplyBurned()).toString(), '50');
        });

        it('should not distribute SUSHIs if no one deposit', async () => {
            // 100 per block farming rate starting at block 200 with bonus until block 1000
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '200', '1000', { from: aliceAddress });
            await this.niceToken.transferOwnership(this.policeChief.address, { from: aliceAddress });
            await this.policeChief.add('100', this.lp.address, true);
            await this.lp.approve(this.policeChief.address, '1000', { from: bobAddress });
            await time.advanceBlockTo('199');
            assert.equal((await this.niceToken.totalSupply()).toString(), '0');
            await time.advanceBlockTo('204');
            assert.equal((await this.niceToken.totalSupply()).toString(), '0');
            await time.advanceBlockTo('209');
            await this.policeChief.deposit(0, '10', { from: bobAddress }); // block 210
            assert.equal((await this.niceToken.totalSupply()).toString(), '0');
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '0');
            assert.equal((await this.niceToken.balanceOf(devAddress)).toString(), '0');
            assert.equal((await this.lp.balanceOf(bobAddress)).toString(), '990');
            await time.advanceBlockTo('219');
            await this.policeChief.withdraw(0, '10', { from: bobAddress }); // block 220
            assert.equal((await this.niceToken.totalSupply()).toString(), '9969');
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '9900');
            assert.equal((await this.niceToken.balanceOf(devAddress)).toString(), '69');
            assert.equal((await this.lp.balanceOf(bobAddress)).toString(), '1000');
        });

        it('should distribute SUSHIs properly for each staker', async () => {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '300', '1000', { from: aliceAddress });
            await this.niceToken.transferOwnership(this.policeChief.address, { from: aliceAddress });
            await this.policeChief.add('100', this.lp.address, true);
            await this.lp.approve(this.policeChief.address, '1000', { from: aliceAddress });
            await this.lp.approve(this.policeChief.address, '1000', { from: bobAddress });
            await this.lp.approve(this.policeChief.address, '1000', { from: carolAddress });
            // aliceAddress deposits 10 LPs at block 310
            await time.advanceBlockTo('309');
            await this.policeChief.deposit(0, '10', { from: aliceAddress });
            // bobAddress deposits 20 LPs at block 314
            await time.advanceBlockTo('313');
            await this.policeChief.deposit(0, '20', { from: bobAddress });
            // carolAddress deposits 30 LPs at block 318
            await time.advanceBlockTo('317');
            await this.policeChief.deposit(0, '30', { from: carolAddress });
            // aliceAddress deposits 10 more LPs at block 320. At this point:
            //   aliceAddress should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
            //   PoliceChief should have the remaining: 10000 - 5666 = 4334
            await time.advanceBlockTo('319')
            await this.policeChief.deposit(0, '10', { from: aliceAddress });
            assert.equal((await this.niceToken.totalSupply()).toString(), '10011');
            assert.equal((await this.niceToken.balanceOf(aliceAddress)).toString(), '5610');
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '0');
            assert.equal((await this.niceToken.balanceOf(carolAddress)).toString(), '0');
            assert.equal((await this.niceToken.balanceOf(this.policeChief.address)).toString(), '4334');
            assert.equal((await this.niceToken.balanceOf(devAddress)).toString(), '67');
            // bobAddress withdraws 5 LPs at block 330. At this point:
            //   bobAddress should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
            await time.advanceBlockTo('329')
            await this.policeChief.withdraw(0, '5', { from: bobAddress });
            assert.equal((await this.niceToken.totalSupply()).toString(), '20019');
            assert.equal((await this.niceToken.balanceOf(aliceAddress)).toString(), '5610');
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '6129');
            assert.equal((await this.niceToken.balanceOf(carolAddress)).toString(), '0');
            assert.equal((await this.niceToken.balanceOf(this.policeChief.address)).toString(), '8144');
            assert.equal((await this.niceToken.balanceOf(devAddress)).toString(), '136');
            // aliceAddress withdraws 20 LPs at block 340.
            // bobAddress withdraws 15 LPs at block 350.
            // carolAddress withdraws 30 LPs at block 360.
            await time.advanceBlockTo('339')
            await this.policeChief.withdraw(0, '20', { from: aliceAddress });
            await time.advanceBlockTo('349')
            await this.policeChief.withdraw(0, '15', { from: bobAddress });
            await time.advanceBlockTo('359')
            await this.policeChief.withdraw(0, '30', { from: carolAddress });
            assert.equal((await this.niceToken.totalSupply()).toString(), '49846');
            assert.equal((await this.niceToken.balanceOf(devAddress)).toString(), '343');
            // aliceAddress should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
            assert.equal((await this.niceToken.balanceOf(aliceAddress)).toString(), '11485');
            // bobAddress should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
            assert.equal((await this.niceToken.balanceOf(bobAddress)).toString(), '11714');
            // carolAddress should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
            assert.equal((await this.niceToken.balanceOf(carolAddress)).toString(), '26303');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(aliceAddress)).toString(), '1000');
            assert.equal((await this.lp.balanceOf(bobAddress)).toString(), '1000');
            assert.equal((await this.lp.balanceOf(carolAddress)).toString(), '1000');
        });

        it('should give proper SUSHIs allocation to each pool', async () => {
            // 100 per block farming rate starting at block 400 with bonus until block 1000
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '400', '1000', { from: aliceAddress });
            await this.niceToken.transferOwnership(this.policeChief.address, { from: aliceAddress });
            await this.lp.approve(this.policeChief.address, '1000', { from: aliceAddress });
            await this.lp2.approve(this.policeChief.address, '1000', { from: bobAddress });
            // Add first LP to the pool with allocation 1
            await this.policeChief.add('10', this.lp.address, true);
            // aliceAddress deposits 10 LPs at block 410
            await time.advanceBlockTo('409');
            await this.policeChief.deposit(0, '10', { from: aliceAddress });
            // Add LP2 to the pool with allocation 2 at block 420
            await time.advanceBlockTo('419');
            await this.policeChief.add('20', this.lp2.address, true);
            // aliceAddress should have 10*1000 pending reward
            assert.equal((await this.policeChief.pendingSushi(0, aliceAddress)).toString(), '10000');
            // bobAddress deposits 10 LP2s at block 425
            await time.advanceBlockTo('424');
            await this.policeChief.deposit(1, '5', { from: bobAddress });
            // aliceAddress should have 10000 + 5*1/3*1000 = 11666 pending reward
            assert.equal((await this.policeChief.pendingSushi(0, aliceAddress)).toString(), '11666');
            await time.advanceBlockTo('430');
            // At block 430. bobAddress should get 5*2/3*1000 = 3333. aliceAddress should get ~1666 more.
            assert.equal((await this.policeChief.pendingSushi(0, aliceAddress)).toString(), '13333');
            assert.equal((await this.policeChief.pendingSushi(1, bobAddress)).toString(), '3333');
        });

        it('should stop giving bonus SUSHIs after the bonus period ends', async () => {
            // 100 per block farming rate starting at block 500 with bonus until block 600
            this.policeChief = await PoliceChief.new(this.niceToken.address, devAddress, '100', '500', '600', { from: aliceAddress });
            await this.niceToken.transferOwnership(this.policeChief.address, { from: aliceAddress });
            await this.lp.approve(this.policeChief.address, '1000', { from: aliceAddress });
            await this.policeChief.add('1', this.lp.address, true);
            // aliceAddress deposits 10 LPs at block 590
            await time.advanceBlockTo('589');
            await this.policeChief.deposit(0, '10', { from: aliceAddress });
            // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
            await time.advanceBlockTo('605');
            assert.equal((await this.policeChief.pendingSushi(0, aliceAddress)).toString(), '10500');
            // At block 606, aliceAddress withdraws all pending rewards and should get 10600.
            await this.policeChief.deposit(0, '0', { from: aliceAddress });
            assert.equal((await this.policeChief.pendingSushi(0, aliceAddress)).toString(), '0');
            assert.equal((await this.niceToken.balanceOf(aliceAddress)).toString(), '10494');
        });
    });
});
