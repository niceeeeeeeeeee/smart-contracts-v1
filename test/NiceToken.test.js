const { expectRevert } = require('@openzeppelin/test-helpers');
const NiceToken = artifacts.require('NiceToken');

contract('NiceToken', ([_, niceTokenOwnerAddress, user1Address, user2Address, user3Address]) => {
    beforeEach(async () => {
        this.niceToken = await NiceToken.new({from: niceTokenOwnerAddress})
        this.defaultBurnDivisor = 100 // 1% burn, changing this will break the tests
        await this.niceToken.setBurnDivisor(this.defaultBurnDivisor, {from: niceTokenOwnerAddress})
    })

    it('should set burn divisor', async () => {
        // default burn divisor has been set
        assert.equal((await this.niceToken.burnDivisor()).toString(), this.defaultBurnDivisor)

        // non owner cannot set
        await expectRevert(
            this.niceToken.setBurnDivisor('50', {from: user1Address}),
            'Ownable: caller is not the owner.',
        );

        // divisor smaller than minimum
        await expectRevert(
            this.niceToken.setBurnDivisor('2', {from: niceTokenOwnerAddress}),
            'NICE::setBurnDivisor: burnDivisor must be bigger than 3',
        );

        // set it properly
        await this.niceToken.setBurnDivisor('40', {from: niceTokenOwnerAddress})
        assert.equal((await this.niceToken.burnDivisor()).toString(), '40')
    });

    it('should have correct name and symbol and decimal', async () => {
        const name = await this.niceToken.name();
        const symbol = await this.niceToken.symbol();
        const decimals = await this.niceToken.decimals();
        assert.equal(name.toString(), 'NiceToken');
        assert.equal(symbol.toString(), 'NICE');
        assert.equal(decimals.toString(), '18');
    });

    it('should only allow owner to mint token', async () => {
        await this.niceToken.mint(niceTokenOwnerAddress, '100', { from: niceTokenOwnerAddress });
        await this.niceToken.mint(user1Address, '1000', { from: niceTokenOwnerAddress });
        await expectRevert(
            this.niceToken.mint(user2Address, '1000', { from: user1Address }),
            'Ownable: caller is not the owner',
        );
        const totalSupply = await this.niceToken.totalSupply();
        const niceTokenOwnerAddressBal = await this.niceToken.balanceOf(niceTokenOwnerAddress);
        const user1AddressBal = await this.niceToken.balanceOf(user1Address);
        const user2AddressBal = await this.niceToken.balanceOf(user2Address);
        assert.equal(totalSupply.toString(), '1100');
        assert.equal(niceTokenOwnerAddressBal.toString(), '100');
        assert.equal(user1AddressBal.toString(), '1000');
        assert.equal(user2AddressBal.toString(), '0');
    });

    it('should supply token transfers properly', async () => {
        await this.niceToken.mint(niceTokenOwnerAddress, '10000', { from: niceTokenOwnerAddress });
        await this.niceToken.mint(user1Address, '10000', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user2Address, '1000', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user2Address, '10000', { from: user1Address });
        const totalSupply = await this.niceToken.totalSupply();
        const totalSupplyBurned = await this.niceToken.totalSupplyBurned();
        const niceTokenOwnerAddressBal = await this.niceToken.balanceOf(niceTokenOwnerAddress);
        const user1AddressBal = await this.niceToken.balanceOf(user1Address);
        const user2AddressBal = await this.niceToken.balanceOf(user2Address);
        const totalBurned = 10 + 100
        assert.equal(totalSupply.toString(), 20000 - totalBurned);
        assert.equal(niceTokenOwnerAddressBal.toString(), '9000');
        assert.equal(user1AddressBal.toString(), '0');
        assert.equal(user2AddressBal.toString(), 990 + 9900);
        assert.equal(totalSupplyBurned.toString(), totalBurned);
    });

    it('should handle micro transfers', async () => {
        // no burn, too small
        await this.niceToken.mint(niceTokenOwnerAddress, '1', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user1Address, '1', { from: niceTokenOwnerAddress });
        assert.equal((await this.niceToken.balanceOf(user1Address)).toString(), '1');
        assert.equal((await this.niceToken.balanceOf(niceTokenOwnerAddress)).toString(), '0');
        assert.equal((await this.niceToken.totalSupply()).toString(), '1');
        assert.equal((await this.niceToken.totalSupplyBurned()).toString(), '0');

        // try delegating
        await this.niceToken.delegate(user2Address, {from: user1Address});
        assert.equal((await this.niceToken.getCurrentVotes(user2Address)).toString(), '1');

        // no burn, too small
        await this.niceToken.mint(niceTokenOwnerAddress, '10', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user1Address, '10', { from: niceTokenOwnerAddress });
        assert.equal((await this.niceToken.balanceOf(user1Address)).toString(), '11');
        assert.equal((await this.niceToken.balanceOf(niceTokenOwnerAddress)).toString(), '0');
        assert.equal((await this.niceToken.totalSupply()).toString(), '11');
        assert.equal((await this.niceToken.totalSupplyBurned()).toString(), '0');

        // delegating had updated
        assert.equal((await this.niceToken.getCurrentVotes(user2Address)).toString(), '11');

        await this.niceToken.mint(niceTokenOwnerAddress, '100', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user1Address, '100', { from: niceTokenOwnerAddress });
        assert.equal((await this.niceToken.balanceOf(user1Address)).toString(), '110');
        assert.equal((await this.niceToken.balanceOf(niceTokenOwnerAddress)).toString(), '0');
        assert.equal((await this.niceToken.totalSupply()).toString(), '110');
        assert.equal((await this.niceToken.totalSupplyBurned()).toString(), '1');

        // delegating had updated
        assert.equal((await this.niceToken.getCurrentVotes(user2Address)).toString(), '110');

        await this.niceToken.mint(niceTokenOwnerAddress, '1000', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user1Address, '1000', { from: niceTokenOwnerAddress });
        assert.equal((await this.niceToken.balanceOf(user1Address)).toString(), '1100');
        assert.equal((await this.niceToken.balanceOf(niceTokenOwnerAddress)).toString(), '0');
        assert.equal((await this.niceToken.totalSupply()).toString(), '1100');
        assert.equal((await this.niceToken.totalSupplyBurned()).toString(), '11');

        // delegating had updated
        assert.equal((await this.niceToken.getCurrentVotes(user2Address)).toString(), '1100');

        await this.niceToken.mint(niceTokenOwnerAddress, '10000', { from: niceTokenOwnerAddress });
        await this.niceToken.transfer(user1Address, '10000', { from: niceTokenOwnerAddress });
        assert.equal((await this.niceToken.balanceOf(user1Address)).toString(), '11000');
        assert.equal((await this.niceToken.balanceOf(niceTokenOwnerAddress)).toString(), '0');
        assert.equal((await this.niceToken.totalSupply()).toString(), '11000');
        assert.equal((await this.niceToken.totalSupplyBurned()).toString(), '111');

        // delegating had updated
        assert.equal((await this.niceToken.getCurrentVotes(user2Address)).toString(), '11000');
    });

    it('should fail if you try to do bad transfers', async () => {
        await this.niceToken.mint(niceTokenOwnerAddress, '100', { from: niceTokenOwnerAddress });
        await expectRevert(
            this.niceToken.transfer(user2Address, '110', { from: niceTokenOwnerAddress }),
            'ERC20: transfer amount exceeds balance',
        );
        await expectRevert(
            this.niceToken.transfer(user2Address, '1', { from: user1Address }),
            'ERC20: transfer amount exceeds balance',
        );
    });

    // https://medium.com/bulldax-finance/sushiswap-delegation-double-spending-bug-5adcc7b3830f
    it('should fix delegate transfer bug', async () => {
        await this.niceToken.mint(niceTokenOwnerAddress, '1000000', { from: niceTokenOwnerAddress });
        await this.niceToken.delegate(user3Address, {from: niceTokenOwnerAddress});
        await this.niceToken.transfer(user1Address, '1000000', {from: niceTokenOwnerAddress} );
        await this.niceToken.delegate(user3Address, {from: user1Address});
        await this.niceToken.transfer(user2Address, '990000', {from: user1Address} );
        await this.niceToken.delegate(user3Address, {from: user2Address});
        await this.niceToken.transfer(niceTokenOwnerAddress, '980100', {from: user2Address} );
        assert.equal((await this.niceToken.totalSupply()).toString(), '970299');
        assert.equal((await this.niceToken.getCurrentVotes(user3Address)).toString(), '970299');
        assert.equal((await this.niceToken.getCurrentVotes(niceTokenOwnerAddress)).toString(), '0');
        assert.equal((await this.niceToken.getCurrentVotes(user1Address)).toString(), '0');
        assert.equal((await this.niceToken.getCurrentVotes(user2Address)).toString(), '0');
    });
  });
