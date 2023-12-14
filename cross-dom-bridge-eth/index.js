#! /usr/local/bin/node

// Transfers between L1 and L2 using the Optimism SDK

const ethers = require("ethers")
const optimismSDK = require("@eth-optimism/sdk")
require('dotenv').config()


const mnemonic = process.env.MNEMONIC

const words = process.env.MNEMONIC.match(/[a-zA-Z]+/g).length
validLength = [12, 15, 18, 24]
if (!validLength.includes(words)) {
   console.log(`The mnemonic (${process.env.MNEMONIC}) is the wrong number of words`)
   process.exit(-1)
}

const l1Url = `https://eth-goerli.g.alchemy.com/v2/${process.env.GOERLI_ALCHEMY_KEY}`
const l2Url = `https://opt-goerli.g.alchemy.com/v2/${process.env.OP_GOERLI_ALCHEMY_KEY}`


const zeroAddr = "0x".padEnd(42, "0");

const l1Contracts = {
    StateCommitmentChain: zeroAddr,
    CanonicalTransactionChain: zeroAddr,
    BondManager: zeroAddr,
    AddressManager: "0x753E4038079EA7D1e1EbE12a2085B159AE31B0A4",
    L1CrossDomainMessenger: "0x91BC106A150F7520eA97C6D61f9e6e169254730e",
    L1StandardBridge: "0x84F0617A60d16121e7B3E9BadD3b91F73E992980",
    OptimismPortal: "0x22458503eF9fa318BE18166C79B29C10063C6b37",
    L2OutputOracle: "0xf8523B3C14a9F3F9C768995eDDC7fF90cFB972b6",
}


// Global variable because we need them almost everywhere
let crossChainMessenger
let addr    // Our address

const getSigners = async () => {
    const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
    const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic)
    const privateKey = hdNode.derivePath(ethers.utils.defaultPath).privateKey
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}   // getSigners


const setup = async() => {
  const [l1Signer, l2Signer] = await getSigners()
  addr = l1Signer.address
  crossChainMessenger = new optimismSDK.CrossChainMessenger({
      l1ChainId: 11155111,    // Goerli value, 1 for mainnet
      l2ChainId: 2333,  // Goerli value, 10 for mainnet
      l1SignerOrProvider: l1Signer,
      l2SignerOrProvider: l2Signer,
      contracts: {
          l1: l1Contracts,
      },
  })
}    // setup



const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18
const centieth = eth/100n


const reportBalances = async () => {
  const l1Balance = (await crossChainMessenger.l1Signer.getBalance()).toString().slice(0,-9)
  const l2Balance = (await crossChainMessenger.l2Signer.getBalance()).toString().slice(0,-9)

  console.log(`On L1:${l1Balance} Gwei    On L2:${l2Balance} Gwei`)
}    // reportBalances


const depositETH = async () => {

  console.log("Deposit ETH")
  await reportBalances()
  const start = new Date()

  const response = await crossChainMessenger.depositETH(1000n * gwei)
  console.log(`Transaction hash (on L1): ${response.hash}`)
  await response.wait()
  console.log("Waiting for status to change to RELAYED")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.waitForMessageStatus(response.hash,
                                                  optimismSDK.MessageStatus.RELAYED)

  await reportBalances()
  console.log(`depositETH took ${(new Date()-start)/1000} seconds\n\n`)
}     // depositETH()



const proveWithdraw = async () => {
    console.log("Prove Withdraw ETH")

    responseHash = "0xcfa2ba855638a49b5b3cca58a1793ea16441c641b3c3f0cae33ac9dcc084534c"
    const response =  await crossChainMessenger.proveMessage(responseHash)
    console.log(`Transaction hash (on L1): ${response.hash}`)
    await response.wait()

}

const finalizeWithdraw = async () => {
    console.log("Finalize Withdraw ETH")

    responseHash = "0xcfa2ba855638a49b5b3cca58a1793ea16441c641b3c3f0cae33ac9dcc084534c"
    const response =   await crossChainMessenger.finalizeMessage(responseHash)
    console.log(`Transaction hash (on L1): ${response.hash}`)
    await response.wait()

}

const withdrawETH = async () => { 
  
  console.log("Withdraw ETH")
  const start = new Date()
  await reportBalances()

  const response = await crossChainMessenger.withdrawETH(centieth)
  console.log(`Transaction hash (on L2): ${response.hash}`)
  console.log(`\tFor more information: https://goerli-optimism.etherscan.io/tx/${response.hash}`)
  await response.wait()

  console.log("Waiting for status to be READY_TO_PROVE")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.waitForMessageStatus(response.hash,
    optimismSDK.MessageStatus.READY_TO_PROVE)
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.proveMessage(response.hash)


  console.log("In the challenge period, waiting for status READY_FOR_RELAY") 
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)
  await crossChainMessenger.waitForMessageStatus(response.hash, 
                                                optimismSDK.MessageStatus.READY_FOR_RELAY) 
  console.log("Ready for relay, finalizing message now")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)  
  await crossChainMessenger.finalizeMessage(response.hash)

  console.log("Waiting for status to change to RELAYED")
  console.log(`Time so far ${(new Date()-start)/1000} seconds`)  
  await crossChainMessenger.waitForMessageStatus(response, 
    optimismSDK.MessageStatus.RELAYED)
  
  await reportBalances()   
  console.log(`withdrawETH took ${(new Date()-start)/1000} seconds\n\n\n`)  
}     // withdrawETH()


const main = async () => {
    await setup()
    // await depositETH()
    // await withdrawETH()
    // await proveWithdraw()
    await finalizeWithdraw()
}  // main



main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })





