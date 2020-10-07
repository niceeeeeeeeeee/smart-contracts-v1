const { expectRevert, time } = require('@openzeppelin/test-helpers');
const NiceToken = artifacts.require('NiceToken');
const PoliceChief = artifacts.require('PoliceChief');
const MockERC20 = artifacts.require('MockERC20');
const {BigNumber} = require('@ethersproject/bignumber');

contract('PoliceChief', ([_, niceDeployerAddress, policeChiefDeployerAddress, devFundAddress, minterAddress, user1Address, user2Address]) => {
    beforeEach(async () => {
        this.niceToken = await NiceToken.new({ from: niceDeployerAddress });
        this.defaultBurnDivisor = 100 // 1% burn, changing this will break the tests
        await this.niceToken.setBurnDivisor(this.defaultBurnDivisor, {from: niceDeployerAddress})
        this.defaultNicePerBlock = '100000000000000000000' // 100 nice
    });

    it('niceBalancePendingHarvest', async () => {
        this.policeChief = await PoliceChief.new(this.niceToken.address, devFundAddress, this.defaultNicePerBlock, '0', '0', { from: policeChiefDeployerAddress });
        await this.niceToken.transferOwnership(this.policeChief.address, {from: niceDeployerAddress})
        await this.policeChief.setDivisors(this.defaultBurnDivisor, this.defaultBurnDivisor, this.defaultBurnDivisor, { from: policeChiefDeployerAddress })

        // add 3 pools
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minterAddress });
        await this.policeChief.add('100', this.lp.address, true, { from: policeChiefDeployerAddress })
        this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minterAddress });
        await this.policeChief.add('100', this.lp2.address, true, { from: policeChiefDeployerAddress })
        this.lp3 = await MockERC20.new('LPToken3', 'LP3', '10000000000', { from: minterAddress });
        await this.policeChief.add('100', this.lp3.address, true, { from: policeChiefDeployerAddress })

        // deposit in 3 pools
        await this.lp.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('0', '100', { from: minterAddress })
        await this.lp2.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('1', '100', { from: minterAddress })
        await this.lp3.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('2', '100', { from: minterAddress })

        let pendingHarvestBefore, pendingHarvestAfter
        
        // try once
        pendingHarvestBefore = (await this.policeChief.niceBalancePendingHarvest(minterAddress)).toString()
        await time.advanceBlock() // advance 1 block to see if pending updated correctly
        pendingHarvestAfter = (await this.policeChief.niceBalancePendingHarvest(minterAddress)).toString()
        // user's pending balance has increased by 100% of the nice per block because he's the only staker
        assert.equal(BigNumber.from(pendingHarvestAfter).sub(BigNumber.from(pendingHarvestBefore)).toString(), this.defaultNicePerBlock)
    
        // try twice
        pendingHarvestBefore = (await this.policeChief.niceBalancePendingHarvest(minterAddress)).toString()
        await time.advanceBlock() // advance 1 block to see if pending updated correctly
        pendingHarvestAfter = (await this.policeChief.niceBalancePendingHarvest(minterAddress)).toString()
        // user's pending balance has increased by 100% of the nice per block because he's the only staker
        assert.equal(BigNumber.from(pendingHarvestAfter).sub(BigNumber.from(pendingHarvestBefore)).toString(), this.defaultNicePerBlock)

        // check balance all and pending harvest should be the same
        assert.equal((await this.policeChief.niceBalanceAll(minterAddress)).toString(), (await this.policeChief.niceBalancePendingHarvest(minterAddress)).toString())
        // balance + pending harvest should equal balance all after harvest
        await this.policeChief.deposit('0', '0', { from: minterAddress })
        let balancePlusPendingHarvest = (await this.niceToken.balanceOf(minterAddress)).add(await this.policeChief.niceBalancePendingHarvest(minterAddress))
        assert.equal((await this.policeChief.niceBalanceAll(minterAddress)).toString(), balancePlusPendingHarvest.toString())
    
        // should still be true after a few blocks
        await time.advanceBlock()
        await time.advanceBlock()
        await time.advanceBlock()
        balancePlusPendingHarvest = (await this.niceToken.balanceOf(minterAddress)).add(await this.policeChief.niceBalancePendingHarvest(minterAddress))
        assert.equal((await this.policeChief.niceBalanceAll(minterAddress)).toString(), balancePlusPendingHarvest.toString())
    })

    it('niceBalanceStaked', async () => {
        // add 2 nice LPs (they own NICE) and 1 non-nice LP
        this.niceLp = await MockERC20.new('LPToken', 'LP', '1000', { from: minterAddress });
        await this.niceToken.mint(this.niceLp.address, '100', {from: niceDeployerAddress})
        this.niceLp2 = await MockERC20.new('LPToken2', 'LP2', '1000', { from: minterAddress });
        await this.niceToken.mint(this.niceLp2.address, '100', {from: niceDeployerAddress})
        this.nonNiceLp = await MockERC20.new('LPToken3', 'LP3', '1000', { from: minterAddress });

        const nicePerBlock = '1'
        this.policeChief = await PoliceChief.new(this.niceToken.address, devFundAddress, nicePerBlock, '0', '0', { from: policeChiefDeployerAddress });
        await this.niceToken.transferOwnership(this.policeChief.address, {from: niceDeployerAddress})
        await this.policeChief.setDivisors(this.defaultBurnDivisor, this.defaultBurnDivisor, this.defaultBurnDivisor, { from: policeChiefDeployerAddress })

        // add 3 pools
        await this.policeChief.add('100', this.niceLp.address, true, { from: policeChiefDeployerAddress })    
        await this.policeChief.add('100', this.niceLp2.address, true, { from: policeChiefDeployerAddress }) 
        await this.policeChief.add('100', this.nonNiceLp.address, true, { from: policeChiefDeployerAddress })

        // user hasn't staked yet
        assert.equal((await this.policeChief.niceBalanceStaked(minterAddress)).toString(), '0')

        // deposit in niceLp
        await this.niceLp.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('0', '100', { from: minterAddress })
        // user owns 100 out of 1000 niceLp tokens, so 10% of the 100 NICE owned by the LP
        assert.equal((await this.niceToken.balanceOf(this.niceLp.address)).toString(), '100')
        assert.equal((await this.policeChief.niceBalanceStaked(minterAddress)).toString(), '10')

        // deposit in nonNiceLp
        await this.nonNiceLp.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('2', '100', { from: minterAddress })
        // user owns 100 out of 1000 niceLp tokens, so 10% of the 0 NICE owned by the LP, so still only 10
        assert.equal((await this.niceToken.balanceOf(this.nonNiceLp.address)).toString(), '0')
        assert.equal((await this.policeChief.niceBalanceStaked(minterAddress)).toString(), '10')

        // deposit in niceLp 2
        await this.niceLp2.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('1', '100', { from: minterAddress })
        // user owns 100 out of 1000 niceLp tokens, so 10% of the 100 NICE owned by the LP, so now 20
        assert.equal((await this.niceToken.balanceOf(this.niceLp2.address)).toString(), '100')
        assert.equal((await this.policeChief.niceBalanceStaked(minterAddress)).toString(), '20')

        // if another user deposits it makes no difference
        await this.niceLp.transfer(user1Address, '100', { from: minterAddress });
        await this.niceLp.approve(this.policeChief.address, '100', { from: user1Address })
        await this.policeChief.deposit('0', '100', { from: user1Address })
        assert.equal((await this.niceToken.balanceOf(this.niceLp2.address)).toString(), '100')
        assert.equal((await this.policeChief.niceBalanceStaked(minterAddress)).toString(), '20')
        // new user who is now also staking 100 / 1000 owns 10% of the 100 NICE in the lp
        assert.equal((await this.policeChief.niceBalanceStaked(user1Address)).toString(), '10')
    
        // check balance all
        let balance, pendingHarvest, staked
        pendingHarvest = await this.policeChief.niceBalancePendingHarvest(minterAddress)
        staked = await this.policeChief.niceBalanceStaked(minterAddress)
        assert.equal((await this.policeChief.niceBalanceAll(minterAddress)).toString(), pendingHarvest.add(staked).toString())
        // balance + pending harvest + staked should equal balance all after harvest
        await this.policeChief.deposit('0', '0', { from: minterAddress })
        balance = await this.niceToken.balanceOf(minterAddress)
        pendingHarvest = await this.policeChief.niceBalancePendingHarvest(minterAddress)
        staked = await this.policeChief.niceBalanceStaked(minterAddress)
        assert.equal((await this.policeChief.niceBalanceAll(minterAddress)).toString(), pendingHarvest.add(staked).add(balance).toString())

        // should still be true after a few blocks
        await time.advanceBlock()
        await time.advanceBlock()
        await time.advanceBlock()

        await this.policeChief.deposit('0', '0', { from: minterAddress })
        balance = await this.niceToken.balanceOf(minterAddress)
        pendingHarvest = await this.policeChief.niceBalancePendingHarvest(minterAddress)
        staked = await this.policeChief.niceBalanceStaked(minterAddress)
        assert.equal((await this.policeChief.niceBalanceAll(minterAddress)).toString(), pendingHarvest.add(staked).add(balance).toString())
    })
});
