import {ethers} from "ethers";
import {
    addTestERC20Token,
    mintTestERC20Token,
    addTestNotApprovedERC20Token,
    deployFranklin,
    deployGovernance,
    deployPriorityQueue,
    deployVerifier,
    franklinTestContractCode,
    verifierTestContractCode,
    governanceTestContractCode,
    priorityQueueTestContractCode
} from "../src.ts/deploy";

import {expect, use, assert} from "chai";
import {solidity} from "ethereum-waffle";
import {bigNumberify, parseEther, hexlify, BigNumber} from "ethers/utils";
import {
    createDepositPublicData,
    createWithdrawPublicData,
    createFullExitPublicData,
    createNoopPublicData,
    createWrongNoopPublicData,
    createWrongDepositPublicData,
    createWrongOperationPublicData,
    hex_to_ascii
} from "./helpers"

use(solidity);

const provider = new ethers.providers.JsonRpcProvider(process.env.WEB3_URL);
const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, "m/44'/60'/0'/0/1").connect(provider);
const exitWallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, "m/44'/60'/0'/0/2").connect(provider);
const franklinAddress = "0809101112131415161718192021222334252627";
const franklinAddressBinary = Buffer.from(franklinAddress, "hex");
const dummyBlockProof = [0, 0, 0, 0, 0, 0, 0, 0];

describe("PLANNED FAILS", function() {
    this.timeout(50000);

    let franklinDeployedContract;
    let governanceDeployedContract;
    let verifierDeployedContract;
    let priorityQueueDeployedContract;
    let erc20DeployedToken1;
    let erc20DeployedToken2;

    beforeEach(async () => {
        console.log("---\n");
        verifierDeployedContract = await deployVerifier(wallet, verifierTestContractCode, []);
        governanceDeployedContract = await deployGovernance(wallet, governanceTestContractCode, [wallet.address]);
        priorityQueueDeployedContract = await deployPriorityQueue(wallet, priorityQueueTestContractCode, [governanceDeployedContract.address]);
        franklinDeployedContract = await deployFranklin(
            wallet,
            franklinTestContractCode,
            [
                governanceDeployedContract.address,
                verifierDeployedContract.address,
                priorityQueueDeployedContract.address,
                wallet.address,
                ethers.constants.HashZero,
            ],
        );
        await governanceDeployedContract.setValidator(wallet.address, true);
        erc20DeployedToken1 = await addTestERC20Token(wallet, governanceDeployedContract);
        erc20DeployedToken2 = await addTestNotApprovedERC20Token(wallet);
        await mintTestERC20Token(wallet, erc20DeployedToken1);
        await mintTestERC20Token(wallet, erc20DeployedToken2);
        // Make sure that exit wallet can execute transactions.
        await wallet.sendTransaction({to: exitWallet.address, value: parseEther("1.0")});
    });

    it("Onchain errors", async () => {
        // ETH deposit: Wrong tx value (msg.value is too low)
        console.log("\n - ETH deposit: Wrong tx value (msg.value is too low) started");
        const depositETH1Value = parseEther("0.003"); // the value passed to tx must be too low
        const depositAmount = parseEther("0.0000000000000001"); // amount after: tx value - some counted fee
        const tx1 = await franklinDeployedContract.depositETH(
            depositAmount,
            franklinAddressBinary,
            {
                value: depositETH1Value,
                gasLimit: bigNumberify("500000")
            }
        );

        await tx1.wait()
        .catch(() => {});

        const code1 = await provider.call(tx1, tx1.blockNumber);
        const reason1 = hex_to_ascii(code1.substr(138));
        
        expect(reason1.substring(0, 5)).equal("fdh11");
        console.log(" + ETH deposit: Wrong tx value (msg.value is too low) passed");

        // ERC20 deposit: Wrong tx value (msg.value < fee)
        console.log("\n - ERC20 deposit: Wrong tx value (msg.value < fee) started");
        const depositERCValue = 78;
        const notCorrectFeeValue = parseEther("0.001");
        await erc20DeployedToken1.approve(franklinDeployedContract.address, depositERCValue);

        const tx3 = await franklinDeployedContract.depositERC20(
            erc20DeployedToken1.address,
            depositERCValue,
            franklinAddressBinary,
            {value: notCorrectFeeValue, gasLimit: bigNumberify("500000")},
        );

        await tx3.wait()
        .catch(() => {});

        const code3 = await provider.call(tx3, tx3.blockNumber);
        const reason3 = hex_to_ascii(code3.substr(138));
        
        expect(reason3.substring(0, 5)).equal("fd011");
        console.log(" + ERC20 deposit: Wrong tx value (msg.value < fee) passed");

        // ERC20 deposit: Wrong token address
        console.log("\n - ERC20 deposit: Wrong token address started");
        const correctFeeValue = parseEther("0.3");
        await erc20DeployedToken2.approve(franklinDeployedContract.address, depositERCValue);

        const tx4 = await franklinDeployedContract.depositERC20(
            erc20DeployedToken2.address,
            depositERCValue,
            franklinAddressBinary,
            {value: correctFeeValue, gasLimit: bigNumberify("500000")}
        );

        await tx4.wait()
        .catch(() => {});

        const code4 = await provider.call(tx4, tx4.blockNumber);
        const reason4 = hex_to_ascii(code4.substr(138));
        
        expect(reason4.substring(0, 5)).equal("gvs11");
        console.log(" + Wrong token address passed");

        // ETH withdraw: balance error
        console.log("\n - ETH withdraw: balance error started");
        const balanceToWithdraw1 = "0x01A2FED090BCD000"
        const tx5 = await franklinDeployedContract.withdrawETH(balanceToWithdraw1, {gasLimit: bigNumberify("500000")});
        await tx5.wait()
        .catch(() => {});

        const code5 = await provider.call(tx5, tx5.blockNumber);
        const reason5 = hex_to_ascii(code5.substr(138));
        
        expect(reason5.substring(0, 5)).equal("frw11");
        console.log(" + ETH withdraw: balance error passed");

        // ERC20 withdraw: Wrong token address
        console.log("\n - ERC20 withdraw: Wrong token address started");
        const tx6 = await franklinDeployedContract.withdrawERC20(erc20DeployedToken2.address ,balanceToWithdraw1, {gasLimit: bigNumberify("500000")});
        await tx6.wait()
        .catch(() => {});

        const code6 = await provider.call(tx6, tx6.blockNumber);
        const reason6 = hex_to_ascii(code6.substr(138));
        
        expect(reason6.substring(0, 5)).equal("gvs11");
        console.log(" + ERC20 withdraw: Wrong token address passed");

        // Full Exit: Wrong token address
        console.log("\n - Full Exit: Wrong token address started");
        const feeValue = parseEther("0.3"); // the value passed to tx
        const tx7 = await franklinDeployedContract.fullExit(
            0,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            erc20DeployedToken2.address,
            Buffer.from("00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "hex"),
            0,
            {
                value: feeValue,
                gasLimit: bigNumberify("500000")
            }
        );

        await tx7.wait()
        .catch(() => {});

        const code7 = await provider.call(tx7, tx7.blockNumber);
        const reason7 = hex_to_ascii(code7.substr(138));

        expect(reason7.substring(0, 5)).equal("gvs11");
        console.log(" + Full Exit: Wrong token address passed");

        // Full Exit: Wrong tx value (lower than fee)
        console.log("\n - Full Exit: Wrong tx value (lower than fee) started");
        const wrongFeeValue = parseEther("0.001"); // the value passed to tx
        const tx8 = await franklinDeployedContract.fullExit(
            0,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            erc20DeployedToken1.address,
            Buffer.from("00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "hex"),
            0,
            {
                value: wrongFeeValue,
                gasLimit: bigNumberify("500000")
            }
        );

        await tx8.wait()
        .catch(() => {});

        const code8 = await provider.call(tx8, tx8.blockNumber);
        const reason8 = hex_to_ascii(code8.substr(138));

        expect(reason8.substring(0, 5)).equal("fft11");
        console.log(" + Full Exit: Wrong tx value (lower than fee) passed");

        // Full Exit: Wrong signature length
        console.log("\n - Full Exit: Wrong signature length started");
        const tx9 = await franklinDeployedContract.fullExit(
            0,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            erc20DeployedToken1.address,
            Buffer.from("000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "hex"),
            0,
            {
                value: feeValue,
                gasLimit: bigNumberify("500000")
            }
        );

        await tx9.wait()
        .catch(() => {});

        const code9 = await provider.call(tx9, tx9.blockNumber);
        const reason9 = hex_to_ascii(code9.substr(138));

        expect(reason9.substring(0, 5)).equal("fft12");
        console.log(" + Full Exit: Wrong signature length passed");
    });

    it("Enter Exodus Mode", async () => {
        console.log("\n - test Exodus Mode started");
        // Deposit eth for exodus
        const depositExodusValue = parseEther("10");
        const depositExodusAmount = parseEther("9.996778"); // amount after: tx value - some counted fee
        const depositExodusFee = parseEther("0.003222"); // tx fee
        const depositExodusTx1 = await franklinDeployedContract.depositETH(
            depositExodusAmount,
            franklinAddressBinary,
            {value: depositExodusValue},
        );
        const depositExodusReceipt1 = await depositExodusTx1.wait();
        const depositExodusEvent1 = depositExodusReceipt1.events[1].args;

        expect(depositExodusEvent1.owner).equal(wallet.address);
        expect(depositExodusEvent1.tokenId).equal(0);
        expect(depositExodusEvent1.amount).equal(depositExodusAmount);
        expect(depositExodusEvent1.fee).equal(depositExodusFee);
        expect(depositExodusEvent1.franklinAddress).equal("0x0809101112131415161718192021222334252627");

        expect(await priorityQueueDeployedContract.totalOpenPriorityRequests()).equal(1);
        expect(await priorityQueueDeployedContract.totalCommittedPriorityRequests()).equal(0);
        expect(await priorityQueueDeployedContract.firstPriorityRequestId()).equal(0);

        console.log("Created new deposit 1");

        const depositExodusTx2 = await franklinDeployedContract.depositETH(
            depositExodusAmount,
            franklinAddressBinary,
            {value: depositExodusValue},
        );
        const depositExodusReceipt2 = await depositExodusTx2.wait();
        const depositExodusEvent2 = depositExodusReceipt2.events[1].args;

        expect(depositExodusEvent2.owner).equal(wallet.address);
        expect(depositExodusEvent2.tokenId).equal(0);
        expect(depositExodusEvent2.amount).equal(depositExodusAmount);
        expect(depositExodusEvent2.fee).equal(depositExodusFee);
        expect(depositExodusEvent2.franklinAddress).equal("0x0809101112131415161718192021222334252627");

        expect(await priorityQueueDeployedContract.totalOpenPriorityRequests()).equal(2);
        expect(await priorityQueueDeployedContract.totalCommittedPriorityRequests()).equal(0);
        expect(await priorityQueueDeployedContract.firstPriorityRequestId()).equal(0);

        console.log("Created new deposit 2");

        const depositExodusTx3 = await franklinDeployedContract.depositETH(
            depositExodusAmount,
            franklinAddressBinary,
            {value: depositExodusValue},
        );
        const depositExodusReceipt3 = await depositExodusTx3.wait();
        const depositExodusEvent3 = depositExodusReceipt3.events[1].args;

        expect(depositExodusEvent3.owner).equal(wallet.address);
        expect(depositExodusEvent3.tokenId).equal(0);
        expect(depositExodusEvent3.amount).equal(depositExodusAmount);
        expect(depositExodusEvent3.fee).equal(depositExodusFee);
        expect(depositExodusEvent3.franklinAddress).equal("0x0809101112131415161718192021222334252627");

        expect(await priorityQueueDeployedContract.totalOpenPriorityRequests()).equal(3);
        expect(await priorityQueueDeployedContract.totalCommittedPriorityRequests()).equal(0);
        expect(await priorityQueueDeployedContract.firstPriorityRequestId()).equal(0);

        console.log("Created new deposit 3");

        // Start committing and verifying noop blocks without full exit priority request
        const noopBlockPublicData = createNoopPublicData();
        const commitTx = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            noopBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        const commitReceipt = await commitTx.wait();
        expect(commitReceipt.events.pop().args.blockNumber).equal(1);

        const verifyTx = await franklinDeployedContract.verifyBlock(1,
            dummyBlockProof,
            {gasLimit: bigNumberify("500000")},
        );
        const verifyReceipt = await verifyTx.wait();
        expect(verifyReceipt.events.pop().args.blockNumber).equal(1);

        // Get commit exodus mode revert code
        const exodusCommitTx = await franklinDeployedContract.commitBlock(2, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            noopBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        const exodusCommitReceipt = await exodusCommitTx.wait()
        .catch(() => {});

        const codeCommitExodus = await provider.call(exodusCommitTx, exodusCommitTx.blockNumber);
        const reasonCommitExodus = hex_to_ascii(codeCommitExodus.substr(138));

        expect(reasonCommitExodus.substring(0, 5)).equal("fre11");

        console.log("Got exodus mode commit tx revert code");

        // Get commit exodus event
        const eventsCommitExodus = exodusCommitReceipt.events;
        const exodusCommitEvent = eventsCommitExodus[0];
        expect(exodusCommitEvent.event).equal("ExodusMode");

        console.log("Got commit exodus event");

        // Get deposit
        const exodusDepositTx = await franklinDeployedContract.depositETH(
            depositExodusAmount,
            franklinAddressBinary,
            {value: depositExodusValue, gasLimit: bigNumberify("8000000")},
        );
        const exodusDepositReceipt = await exodusDepositTx.wait()
        .catch(() => {});

        const codeDepositExodus = await provider.call(exodusDepositTx, exodusDepositTx.blockNumber);
        const reasonDepositExodus = hex_to_ascii(codeDepositExodus.substr(138));

        expect(reasonDepositExodus.substring(0, 5)).equal("fre11");

        console.log("Got exodus mode deposit tx revert code");

        // Check balance to be nill
        let balanceToWithdraw = await franklinDeployedContract.balancesToWithdraw(wallet.address, 0);
        expect(balanceToWithdraw).equal(parseEther("0"));

        // Cancel first 2 deposits
        const cancelTx1 = await franklinDeployedContract.cancelOutstandingDepositsForExodusMode();
        await cancelTx1.wait();
        
        balanceToWithdraw = await franklinDeployedContract.balancesToWithdraw(wallet.address, 0);
        expect(balanceToWithdraw).equal(parseEther("19.993556"));

        // Cancel last deposit
        const cancelTx2 = await franklinDeployedContract.cancelOutstandingDepositsForExodusMode();
        await cancelTx2.wait();
        
        balanceToWithdraw = await franklinDeployedContract.balancesToWithdraw(wallet.address, 0);
        expect(balanceToWithdraw).equal(parseEther("29.990334"));

        console.log("Deposits canceled");

        // Withdraw eth
        const oldBalance2 = await wallet.getBalance();
        const exitTx2 = await franklinDeployedContract.withdrawETH(balanceToWithdraw);
        const exitTxReceipt2 = await exitTx2.wait();
        const gasUsed2 = exitTxReceipt2.gasUsed.mul(await provider.getGasPrice());
        const newBalance2 = await wallet.getBalance();
        expect(newBalance2.sub(oldBalance2).add(gasUsed2)).eq(balanceToWithdraw);

        balanceToWithdraw = await franklinDeployedContract.balancesToWithdraw(wallet.address, 0);
        expect(balanceToWithdraw).equal(bigNumberify(0));

        console.log("Balances withdrawed");

        console.log(" + test Exodus Mode passed");
    });

    it("Block commit errors", async () => {
        const noopBlockPublicData = createNoopPublicData();

        // Wrong commit number
        console.log("\n - Wrong commit number started");

        const tx1 = await franklinDeployedContract.commitBlock(2, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            noopBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx1.wait()
        .catch(() => {});

        const code1 = await provider.call(tx1, tx1.blockNumber);
        const reason1 = hex_to_ascii(code1.substr(138));
        
        expect(reason1.substring(0, 5)).equal("fck11");
        console.log(" + Wrong commit number passed");

        // Wrong noop pubdata - less length
        console.log("\n - Wrong noop pubdata - less length started");
        const wrongNoopBlockPublicData = createWrongNoopPublicData();

        const tx2 = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            wrongNoopBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx2.wait()
        .catch(() => {});

        const code2 = await provider.call(tx2, tx2.blockNumber);
        const reason2 = hex_to_ascii(code2.substr(138));
        
        expect(reason2.substring(0, 5)).equal("fcs11");
        console.log(" + Wrong noop pubdata - less length passed");

        // Wrong deposit pubdata - less length
        console.log("\n - Wrong deposit pubdata - less length started");
        let depositAmount = parseEther("0.3");
        const wrongDepositBlockPublicData = createWrongDepositPublicData(0, hexlify(depositAmount), franklinAddress);

        const tx3 = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            wrongDepositBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx3.wait()
        .catch(() => {});

        const code3 = await provider.call(tx3, tx3.blockNumber);
        const reason3 = hex_to_ascii(code3.substr(138));
        
        expect(reason3.substring(0, 5)).equal("bse11");
        console.log(" + Wrong deposit pubdata - less length passed");

        // Wrong operation id
        console.log("\n - Wrong operation pubdata - wrong op id started");
        const wrongOperationPublicData = createWrongOperationPublicData();

        const tx4 = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            wrongOperationPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx4.wait()
        .catch(() => {});

        const code4 = await provider.call(tx4, tx4.blockNumber);
        const reason4 = hex_to_ascii(code4.substr(138));
        
        expect(reason4.substring(0, 5)).equal("fpp14");
        console.log(" + Wrong operation pubdata - wrong op id passed");

        // Wrong priority operation - non existed
        console.log("\n - Wrong priority operation - non existed started");
        const depositPublicData = createDepositPublicData(0, hexlify(depositAmount), franklinAddress);

        const tx5 = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            depositPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx5.wait()
        .catch(() => {});

        const code5 = await provider.call(tx5, tx5.blockNumber);
        const reason5 = hex_to_ascii(code5.substr(138));
        
        expect(reason5.substring(0, 5)).equal("pvs11");
        console.log(" + Wrong priority operation - non existed passed");

        // Wrong priority operation - different data
        console.log("\n - Wrong priority operation - different data started");
        const depositValue = parseEther("0.3"); // the value passed to tx
        const depositCorrectAmount = parseEther("0.296778"); // amount after: tx value - some counted fee
        const depositFee = parseEther("0.003222"); // tx fee
        const depositTx = await franklinDeployedContract.depositETH(depositCorrectAmount, franklinAddressBinary, {value: depositValue});
        const depositReceipt = await depositTx.wait();
        const depositEvent = depositReceipt.events[1].args;

        expect(depositEvent.owner).equal(wallet.address);
        expect(depositEvent.tokenId).equal(0);
        expect(depositEvent.amount).equal(depositCorrectAmount);
        expect(depositEvent.fee).equal(depositFee);
        expect(depositEvent.franklinAddress).equal("0x0809101112131415161718192021222334252627");

        expect(await priorityQueueDeployedContract.totalOpenPriorityRequests()).equal(1);
        expect(await priorityQueueDeployedContract.firstPriorityRequestId()).equal(0);

        const tx6 = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            depositPublicData, // the part that went to fee will not be taken into account
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx6.wait()
        .catch(() => {});

        const code6 = await provider.call(tx6, tx6.blockNumber);
        const reason6 = hex_to_ascii(code6.substr(138));
        
        expect(reason6.substring(0, 5)).equal("fvs11");
        console.log(" + Wrong priority operation - different data passed");

        // Not governor commit
        console.log("\n - Not governor started");
        const exitWalletFranklinContract = franklinDeployedContract.connect(exitWallet);
        const tx7 = await exitWalletFranklinContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            noopBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await tx7.wait()
        .catch(() => {});

        const code7 = await provider.call(tx7, tx7.blockNumber);
        const reason7 = hex_to_ascii(code7.substr(138));
        
        expect(reason7.substring(0, 5)).equal("grr21");
        console.log(" + Not governor passed");
    });

    it("Block verify errors", async () => {
        const noopBlockPublicData = createNoopPublicData();

        const tx = await franklinDeployedContract.commitBlock(1, 22,
            Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
            noopBlockPublicData,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        tx.wait();

        // Wrong commit number
        console.log("\n - Wrong verify number started");

        const tx1 = await franklinDeployedContract.verifyBlock(2, dummyBlockProof, {gasLimit: bigNumberify("500000")});
        await tx1.wait()
        .catch(() => {});

        const code1 = await provider.call(tx1, tx1.blockNumber);
        const reason1 = hex_to_ascii(code1.substr(138));
        
        expect(reason1.substring(0, 5)).equal("fvk11");
        console.log(" + Wrong verify number passed");

        // Not governor commit
        console.log("\n - Not governor started");
        const exitWalletFranklinContract = franklinDeployedContract.connect(exitWallet);
        const tx2 = await exitWalletFranklinContract.verifyBlock(1, dummyBlockProof, {gasLimit: bigNumberify("500000")});
        await tx2.wait()
        .catch(() => {});

        const code2 = await provider.call(tx2, tx2.blockNumber);
        const reason2 = hex_to_ascii(code2.substr(138));
        
        expect(reason2.substring(0, 5)).equal("grr21");
        console.log(" + Not governor passed");
    });

    it("Enter blocks revert", async () => {
        console.log("\n - Blocks revert started");
        const noopBlockPublicData = createNoopPublicData();

        let reverted = false;
        for (let i = 0; i < 10000; i++) {

            expect(await franklinDeployedContract.totalBlocksCommitted()).equal(i);
            const tx = await franklinDeployedContract.commitBlock(i + 1, 22,
                Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
                noopBlockPublicData,
                {
                    gasLimit: bigNumberify("500000"),
                },
            );
            const receipt = await tx.wait();

            const event = receipt.events.pop();
            if (event.event == "BlocksReverted") {
                expect(await franklinDeployedContract.totalBlocksCommitted()).equal(0);
                reverted = true;
                break;
            }
        }

        expect(reverted).equal(true);
        console.log(" + Blocks revert passed");
    });

    it("Priority Queue errors", async () => {
        console.log("\n - Set franklin address twice will not work started");
        // Set franklin address again

        const prTx2 = await priorityQueueDeployedContract.setFranklinAddress(
            franklinDeployedContract.address,
            {
                gasLimit: bigNumberify("500000"),
            },
        );
        await prTx2.wait()
        .catch(() => {});

        const code1 = await provider.call(prTx2, prTx2.blockNumber);
        const reason1 = hex_to_ascii(code1.substr(138));
        
        expect(reason1.substring(0, 5)).equal("pcs11");
        console.log(" + Set franklin address twice will not work passed");
    });
});
