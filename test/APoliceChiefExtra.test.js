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
        this.defaultNicePerBlock = '5000000000000000' // 0.005
    });

    it('should allow governance to set divisors', async () => {
        this.policeChief = await PoliceChief.new(this.niceToken.address, devFundAddress, this.defaultNicePerBlock, '0', '0', { from: policeChiefDeployerAddress });

        // default divisor values
        assert.equal((await this.policeChief.deflationMintDivisor()).toString(), '100')
        assert.equal((await this.policeChief.deflationBurnDivisor()).toString(), '5')
        assert.equal((await this.policeChief.inflationBurnDivisor()).toString(), '100')
        assert.equal((await this.niceToken.burnDivisor()).toString(), '100')

        // only owner
        await expectRevert(this.policeChief.setDivisors('100', '200', '300', { from: user1Address }), 'Ownable: caller is not the owner.');

        // only owner of nice token
        await expectRevert(this.policeChief.setDivisors('100', '200', '300', { from: policeChiefDeployerAddress }), 'Ownable: caller is not the owner.');
        await this.niceToken.transferOwnership(this.policeChief.address, { from: niceDeployerAddress })

        // set it correctly
        await this.policeChief.setDivisors('100', '200', '300', { from: policeChiefDeployerAddress })
        assert.equal((await this.policeChief.deflationMintDivisor()).toString(), '100')
        assert.equal((await this.policeChief.deflationBurnDivisor()).toString(), '200')
        assert.equal((await this.policeChief.inflationBurnDivisor()).toString(), '300')
        assert.equal((await this.niceToken.burnDivisor()).toString(), '300')

        await this.policeChief.setDivisors('10000000000', '20000000000', '30000000000', { from: policeChiefDeployerAddress })
        assert.equal((await this.policeChief.deflationMintDivisor()).toString(), '10000000000')
        assert.equal((await this.policeChief.deflationBurnDivisor()).toString(), '20000000000')
        assert.equal((await this.policeChief.inflationBurnDivisor()).toString(), '30000000000')
        assert.equal((await this.niceToken.burnDivisor()).toString(), '30000000000')

        // set to min valued
        await this.policeChief.setDivisors('1', '4', '4', { from: policeChiefDeployerAddress })
        assert.equal((await this.policeChief.deflationMintDivisor()).toString(), '1')
        assert.equal((await this.policeChief.deflationBurnDivisor()).toString(), '4')
        assert.equal((await this.policeChief.inflationBurnDivisor()).toString(), '4')
        assert.equal((await this.niceToken.burnDivisor()).toString(), '4')

        // below min values
        await expectRevert(this.policeChief.setDivisors('0', '10', '10', { from: policeChiefDeployerAddress }), 'setDivisors: deflationMintDivisor must be bigger than 0.');
        await expectRevert(this.policeChief.setDivisors('10', '0', '10', { from: policeChiefDeployerAddress }), 'NICE::setBurnDivisor: burnDivisor must be bigger than 3.');
        await expectRevert(this.policeChief.setDivisors('10', '1', '10', { from: policeChiefDeployerAddress }), 'NICE::setBurnDivisor: burnDivisor must be bigger than 3.');
        await expectRevert(this.policeChief.setDivisors('10', '2', '10', { from: policeChiefDeployerAddress }), 'NICE::setBurnDivisor: burnDivisor must be bigger than 3.');
        await expectRevert(this.policeChief.setDivisors('10', '10', '0', { from: policeChiefDeployerAddress }), 'NICE::setBurnDivisor: burnDivisor must be bigger than 3.');
        await expectRevert(this.policeChief.setDivisors('10', '10', '1', { from: policeChiefDeployerAddress }), 'NICE::setBurnDivisor: burnDivisor must be bigger than 3.');
        await expectRevert(this.policeChief.setDivisors('10', '10', '2', { from: policeChiefDeployerAddress }), 'NICE::setBurnDivisor: burnDivisor must be bigger than 3.');
    })

    it('should set divisors correctly during deflation', async () => {
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minterAddress });
        this.policeChief = await PoliceChief.new(this.niceToken.address, devFundAddress, this.defaultNicePerBlock, '0', '0', { from: policeChiefDeployerAddress });
        // mint 421 tokens
        await this.niceToken.mint(niceDeployerAddress, '421000000000000000000', { from: niceDeployerAddress })
        assert.equal((await this.niceToken.totalSupply()).toString(), '421000000000000000000')
        await this.niceToken.transferOwnership(this.policeChief.address, { from: niceDeployerAddress })

        // set correct burn rate during inflation
        assert.equal((await this.policeChief.isInflating()).valueOf(), true)
        await this.policeChief.setDivisors('10', '10', '20', { from: policeChiefDeployerAddress })
        assert.equal((await this.niceToken.burnDivisor()).toString(), '20')

        // trigger deflation period by updating pools
        await this.policeChief.add('100', this.lp.address, true, { from: policeChiefDeployerAddress })
        await this.lp.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('0', '100', { from: minterAddress })

        // check if success
        assert.equal((await this.policeChief.isInflating()).valueOf(), false)
        await this.policeChief.setDivisors('10', '30', '10', { from: policeChiefDeployerAddress })
        assert.equal((await this.niceToken.burnDivisor()).toString(), '30')
    })

    it('should update isInflating', async () => {
        const nicePerBlock = '100000000000000000000' // 100 nice, very high to mint fast later
        this.policeChief = await PoliceChief.new(this.niceToken.address, devFundAddress, nicePerBlock, '0', '0', { from: policeChiefDeployerAddress });

        // set high burn rate to burn later
        await this.niceToken.setBurnDivisor('4', { from: niceDeployerAddress })

        // mint 419 tokens
        await this.niceToken.mint(niceDeployerAddress, '419000000000000000000', { from: niceDeployerAddress })
        assert.equal((await this.niceToken.totalSupply()).toString(), '419000000000000000000')

        // supply is below 420 and deflation does not starts
        assert.equal((await this.policeChief.isInflating()).valueOf(), true)
        await this.policeChief.updateIsInflating()
        assert.equal((await this.policeChief.isInflating()).valueOf(), true)

        // mint 2 more tokens, total 421
        await this.niceToken.mint(niceDeployerAddress, '2000000000000000000', { from: niceDeployerAddress })
        assert.equal((await this.niceToken.totalSupply()).toString(), '421000000000000000000')
        await this.niceToken.transferOwnership(this.policeChief.address, { from: niceDeployerAddress })

        // supply is above 420 and deflation starts
        assert.equal((await this.policeChief.isInflating()).valueOf(), true)
        await this.policeChief.updateIsInflating()
        assert.equal((await this.policeChief.isInflating()).valueOf(), false)

        // burn until below 69 supply
        let niceTotalSupply
        do {
            await this.niceToken.transfer(niceDeployerAddress, (await this.niceToken.balanceOf(niceDeployerAddress)).toString(), { from: niceDeployerAddress })
            niceTotalSupply = (await this.niceToken.totalSupply()).toString()
        }
        while (BigNumber.from(niceTotalSupply).gt(BigNumber.from('69000000000000000000')))

        // supply should be below 69 so start inflating
        assert.equal((await this.policeChief.isInflating()).valueOf(), false)
        await this.policeChief.updateIsInflating()
        assert.equal((await this.policeChief.isInflating()).valueOf(), true)

        // set easy to use divisors for the following tests
        const deflationMintDivisor = '100';
        const deflationBurnDivisor = '5';
        const inflationBurnDivisor = '100';
        await this.policeChief.setDivisors(deflationMintDivisor, deflationBurnDivisor, inflationBurnDivisor, { from: policeChiefDeployerAddress })
        assert.equal((await this.policeChief.deflationMintDivisor()).toString(), '100')
        assert.equal((await this.policeChief.deflationBurnDivisor()).toString(), '5')
        assert.equal((await this.policeChief.inflationBurnDivisor()).toString(), '100')
        const nicePerBlockMinusInflationBurn = BigNumber.from(nicePerBlock).sub(BigNumber.from(nicePerBlock).div(BigNumber.from(inflationBurnDivisor))).toString()
        const nicePerBlockDuringDeflation = BigNumber.from(nicePerBlock).div(BigNumber.from(deflationMintDivisor)).toString()
        const nicePerBlockDuringDeflationMinusDeflationBurn = BigNumber.from(nicePerBlockDuringDeflation).sub(BigNumber.from(nicePerBlockDuringDeflation).div(BigNumber.from(deflationBurnDivisor))).toString()

        // mint nice from pool until 420
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minterAddress });
        await this.policeChief.add('100', this.lp.address, true, { from: policeChiefDeployerAddress })
        await this.lp.approve(this.policeChief.address, '100', { from: minterAddress })
        await this.policeChief.deposit('0', '100', { from: minterAddress })
        do {
            const balanceBeforeHarvest = (await this.niceToken.balanceOf(minterAddress)).toString()
            await this.policeChief.deposit('0', '0', { from: minterAddress }) // harvest by depositing 0
            const balanceAfterHarvest = (await this.niceToken.balanceOf(minterAddress)).toString()
            // nicePerBlockMinusInflationBurn should be accurate
            assert.equal(BigNumber.from(balanceBeforeHarvest).add(BigNumber.from(nicePerBlockMinusInflationBurn)).toString(), balanceAfterHarvest)

            niceTotalSupply = (await this.niceToken.totalSupply()).toString()
        }
        while (BigNumber.from(niceTotalSupply).lt(BigNumber.from('420000000000000000000')))

        // supply should be above 69 so start deflating
        assert.equal((await this.policeChief.isInflating()).valueOf(), true)
        // update pool should trigger deflation
        await this.policeChief.deposit('0', '0', { from: minterAddress })
        assert.equal((await this.policeChief.isInflating()).valueOf(), false)

        // check pool deflated rewards during deflation
        const balanceBeforeHarvest = (await this.niceToken.balanceOf(minterAddress)).toString()
        await this.policeChief.deposit('0', '0', { from: minterAddress }) // harvest by depositing 0
        const balanceAfterHarvest = (await this.niceToken.balanceOf(minterAddress)).toString()
        assert.equal(BigNumber.from(balanceAfterHarvest).sub(BigNumber.from(balanceBeforeHarvest)).toString(), nicePerBlockDuringDeflationMinusDeflationBurn)

        // check pending harvest during deflation
        await time.advanceBlock() // advance 1 block because we just harvested
        const pendingHarvest = (await this.policeChief.pendingSushi('0', minterAddress)).toString()
        assert.equal(pendingHarvest, nicePerBlockDuringDeflation)

        // burn until below 69 supply
        do {
            const balanceBeforeBurn = (await this.niceToken.balanceOf(minterAddress)).toString()
            const burnAmount = BigNumber.from(balanceBeforeBurn).div(BigNumber.from(deflationBurnDivisor)).toString()
            await this.niceToken.transfer(minterAddress, balanceBeforeBurn, { from: minterAddress })
            const balanceAfterBurn = (await this.niceToken.balanceOf(minterAddress)).toString()
            // deflationBurnDivisor should be correct
            assert.equal(BigNumber.from(balanceBeforeBurn).sub(BigNumber.from(burnAmount)).toString(), balanceAfterBurn)

            niceTotalSupply = (await this.niceToken.totalSupply()).toString()
        }
        while (BigNumber.from(niceTotalSupply).gt(BigNumber.from('69000000000000000000')))
    })
});
