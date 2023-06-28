import {ethers} from "hardhat";
import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {deployFactoryFixture} from "../fixtures";
import {BigNumber} from "ethers";

describe.only('Gateway', () => {
  describe('constructor', () => {
    describe('when factory address is not specified', () => {
      it('should revert', async () => {
        await expect(ethers.deployContract('Gateway', [ethers.constants.AddressZero, []])).to.be.reverted;
      });
    });
  });

  describe('.deployIdentityWithSalt()', () => {
    describe('when signature is not valid', () => {
      it('should revert with UnsignedDeployment', async () => {
        const {identityFactory, aliceWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);

        await expect(gateway.deployIdentityWithSalt(aliceWallet.address, 'saltToUse', BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60), ethers.utils.randomBytes(65))).to.be.reverted;
      });
    });

    describe('when signature is signed by a non authorized signer', () => {
      it('should revert with UnsignedDeployment', async () => {
        const {identityFactory, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);

        await expect(
          gateway.deployIdentityWithSalt(
            aliceWallet.address,
            'saltToUse',
            BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60),
            bobWallet.signMessage(
              ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['string', 'address', 'string', 'uint256'], ['Authorize ONCHAINID deployment', aliceWallet.address, 'saltToUse', BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60)])),
            ),
          ),
        ).to.be.revertedWithCustomError(gateway, 'UnapprovedSigner');
      });
    });

    describe('when signature is correct and signed by an authorized signer', () => {
      it('should deploy the identity', async () => {
        const {identityFactory, aliceWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        const digest =
          ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
              ['string', 'address', 'string', 'uint256'],
              ['Authorize ONCHAINID deployment', aliceWallet.address, 'saltToUse', BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60)],
            ),
          );
        const signature = await carolWallet.signMessage(
          ethers.utils.arrayify(
            digest,
          ),
        );

        const tx = await gateway.deployIdentityWithSalt(
          aliceWallet.address,
          'saltToUse',
          BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60),
          signature,
        );
        await expect(tx).to.emit(identityFactory, "WalletLinked").withArgs(aliceWallet.address, await identityFactory.getIdentity(aliceWallet.address));
        await expect(tx).to.emit(identityFactory, "Deployed").withArgs(await identityFactory.getIdentity(aliceWallet.address));
        const identityAddress = await identityFactory.getIdentity(aliceWallet.address);
        const identity = await ethers.getContractAt('Identity', identityAddress);
        expect(await identity.keyHasPurpose(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [aliceWallet.address])), 1)).to.be.true;
      });
    });

    describe('when signature is correct with no expiry', () => {
      it('should deploy the identity', async () => {
        const {identityFactory, aliceWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        const digest =
          ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
              ['string', 'address', 'string', 'uint256'],
              ['Authorize ONCHAINID deployment', aliceWallet.address, 'saltToUse', 0],
            ),
          );
        const signature = await carolWallet.signMessage(
          ethers.utils.arrayify(
            digest,
          ),
        );

        const tx = await gateway.deployIdentityWithSalt(
          aliceWallet.address,
          'saltToUse',
          0,
          signature,
        );
        await expect(tx).to.emit(identityFactory, "WalletLinked").withArgs(aliceWallet.address, await identityFactory.getIdentity(aliceWallet.address));
        await expect(tx).to.emit(identityFactory, "Deployed").withArgs(await identityFactory.getIdentity(aliceWallet.address));
        const identityAddress = await identityFactory.getIdentity(aliceWallet.address);
        const identity = await ethers.getContractAt('Identity', identityAddress);
        expect(await identity.keyHasPurpose(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [aliceWallet.address])), 1)).to.be.true;
      });
    });

    describe('when signature is correct and signed by an authorized signer, but revoked', () => {
      it('should revert', async () => {
        const {identityFactory, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        const digest =
          ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
              ['string', 'address', 'string', 'uint256'],
              ['Authorize ONCHAINID deployment', aliceWallet.address, 'saltToUse', BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60)],
            ),
          );
        const signature = await carolWallet.signMessage(
          ethers.utils.arrayify(
            digest,
          ),
        );

        await gateway.revokeSignature(signature);

        await expect(gateway.deployIdentityWithSalt(
          aliceWallet.address,
          'saltToUse',
          BigNumber.from(new Date().getTime()).div(1000).add(365 * 24 * 60 * 60),
          signature,
        )).to.be.revertedWithCustomError(gateway, 'RevokedSignature');
      });
    });

    describe('when signature is correct and signed by an authorized signer, but has expired', () => {
      it('should revert', async () => {
        const {identityFactory, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        const digest =
          ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
              ['string', 'address', 'string', 'uint256'],
              ['Authorize ONCHAINID deployment', aliceWallet.address, 'saltToUse', BigNumber.from(new Date().getTime()).div(1000).sub(2 * 24 * 60 * 60)],
            ),
          );
        const signature = await carolWallet.signMessage(
          ethers.utils.arrayify(
            digest,
          ),
        );

        await gateway.revokeSignature(signature);

        await expect(gateway.deployIdentityWithSalt(
          aliceWallet.address,
          'saltToUse',
          BigNumber.from(new Date().getTime()).div(1000).sub(2 * 24 * 60 * 60),
          signature,
        )).to.be.revertedWithCustomError(gateway, 'ExpiredSignature');
      });
    });
  });

  describe('deployIdentityForWallet', () => {
    describe('when sender is not the desired identity owner', () => {
      it('should revert', async () => {
        const {identityFactory, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);
        await expect(gateway.deployIdentityForWallet(aliceWallet.address)).to.revertedWithCustomError(gateway, 'UnapprovedSigner');
      });
    });

    describe('when an identity was not yet deployed for this walet', () => {
      it('should deploy the identity', async () => {
        const {identityFactory, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);
        const tx = await gateway.connect(aliceWallet).deployIdentityForWallet(aliceWallet.address);

        await expect(tx).to.emit(identityFactory, "WalletLinked").withArgs(aliceWallet.address, await identityFactory.getIdentity(aliceWallet.address));
        await expect(tx).to.emit(identityFactory, "Deployed").withArgs(await identityFactory.getIdentity(aliceWallet.address));
        const identityAddress = await identityFactory.getIdentity(aliceWallet.address);
        const identity = await ethers.getContractAt('Identity', identityAddress);

        expect(await identity.keyHasPurpose(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [aliceWallet.address])), 1)).to.be.true;
      });
    });

    describe('when an identity was already deployed for this wallet as salt with the factory', () => {
      it('should revert because factory reverts', async () => {
        const {identityFactory, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        await gateway.connect(aliceWallet).deployIdentityForWallet(aliceWallet.address);

        await expect(gateway.connect(aliceWallet).deployIdentityForWallet(aliceWallet.address)).to.be.revertedWith('salt already taken');
      });
    });
  });

  describe('.transferFactoryOwnership', () => {
    describe('when called by the owner', () => {
      it('should transfer ownership of the factory to the specified address', async () => {
        const {identityFactory, deployerWallet, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        await expect(gateway.transferFactoryOwnership(bobWallet.address)).to.emit(identityFactory, "OwnershipTransferred").withArgs(gateway.address, bobWallet.address);
        expect(await identityFactory.owner()).to.be.equal(bobWallet.address);
      });
    });

    describe('when not called by the owner', () => {
      it('should revert', async () => {
        const {identityFactory, deployerWallet, aliceWallet, bobWallet, carolWallet} = await loadFixture(deployFactoryFixture);
        const gateway = await ethers.deployContract('Gateway', [identityFactory.address, [carolWallet.address]]);
        await identityFactory.transferOwnership(gateway.address);

        await expect(gateway.connect(aliceWallet).transferFactoryOwnership(bobWallet.address)).to.be.revertedWith('Ownable: caller is not the owner')
      });
    });
  });
});
