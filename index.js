const { ethers, Contract } = require('ethers')
const express = require('express');
const mongoose = require('mongoose');
const dbConnect = require('./mongodb');
require('./dbConfig');
const { abi } = require('./ContractAbi.json');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const userModel = require('./users')
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');
const app = express();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads')
  },
  filename: function (req, file, cb) {
    const fn = Date.now() + '-' + file.fieldname + '.png';
    cb(null, fn)
  }
})

const upload = multer({ storage: storage })
const sgMail = require('@sendgrid/mail');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { API_KEY_LIVE, PRIVATE_KEY, API_KEY, GRID_API, PINATA_API_KEY, PINATA_SECRET_API_KEY, NFT_CONTRACT_ADDRESS } = process.env;

sgMail.setApiKey(GRID_API);

app.use(bodyParser.json({ limit: '10mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 1000000 }));
app.post('/signUp', async (req, res) => {
  try {
    const { name, wallet, email, password, uname } = req.body;
    const verificationToken = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, 10);
    const userDetail = new userModel({
      name,
      email,
      verified: false,
      password: hashedPassword,
      uname,
      wallet,
      verificationToken,
    });
    await userDetail.save();
    const verificationLink = `http://localhost:5000/verify?token=${verificationToken}`;
    const message = {
      to: email,
      from: 'hammasali142@gmail.com',
      subject: 'Account Verification',
      text: `Please click the following link to verify your account: ${verificationLink}`,
      html: `<p>Please click the following link to verify your account:</p><a href="${verificationLink}">${verificationLink}</a>`,
    };

    await sgMail.send(message);

    res.send('Verification email sent to ' + email);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error occurred');
  }
});

app.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;
    const user = await userModel.findOne({ verificationToken: token });

    if (!user) {
      res.send('Invalid verification token');
      return;
    }
    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    res.send('Account verified successfully');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error occurred');
  }
});


app.post('/signIn', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      return;
    }
    const API_KEY = user.walletAddress;
    console.log(API_KEY);
    // Generate a JWT token that expires in 10 minutes
    const token = jwt.sign({ email }, API_KEY, { expiresIn: '120m' });
    user.jwtToken = token;
    console.log(token);
    await user.save();
    res.json({
      status: 'success',
      message: 'Login successful',
      token,
      user: {
        uname: user.uname,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ status: 'error', message: 'Error occurred' });
  }
});

const NFT = require('./nftModel');


const signAndSendTransaction = async (ownerPrivateKey, recipientWallet, contractAddress, metadataHash) => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(API_KEY);
    const contract = require('./ContractAbi.json');
    const wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const nftContract = new ethers.Contract(contractAddress, contract.abi, wallet);
    const nonce = await wallet.getTransactionCount();
    const tx = await nftContract.mintNFT(recipientWallet, metadataHash, { nonce, gasLimit: 500000 });
    console.log("The hash of your transaction is:", tx.hash);
    console.log("Check the block explorer to view the status of your transaction!");


    return tx.hash;


  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
};
const axios = require('axios');
const { timeStamp } = require('console');
const nftModel = require('./nftModel');

const uploadMetadataToIPFS = async (formData) => {
  try {


    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_API_KEY,
      },
    });
    const ipfsHash = response.data.IpfsHash;
    console.log('Image uploaded to IPFS:', ipfsHash);
    return ipfsHash;
  } catch (error) {
    console.error('Error uploading image to IPFS:', error);
    throw error;
  }
};
app.post('/mint-nft', upload.single('imageFile'), async (req, res) => {
  const jwtToken = req.headers.authorization;
  console.log(jwtToken);
  const user = await userModel.findOne({ jwtToken });
  console.log(user);
  const decodedToken = await jwt.verify(jwtToken, user.walletAddress);
  const tokenExpirationDate = new Date(decodedToken.exp * 1000);
  if (tokenExpirationDate < new Date()) {
    res.status(401).json({ status: 'error', message: 'Token has expired' });
    return;
  }
  try {
    console.log(req.file);

    const { name, description, image, wallet, attributes } = req.body;
    const pinataIPFSaddress = req.body.image;
    const fn = req.file.filename;
    const imagePath = `./uploads/${fn}`;
    const metadata = req.body;
    const imagee = fs.readFileSync(imagePath);
    const formData = new FormData();
    formData.append('file', imagee, { filename: `${fn}` });
    const imageHash = await uploadMetadataToIPFS(formData);
    metadata.image = (req.body.image) + (imageHash)
    metadata.attributes = JSON.parse(req.body.attributes);
    console.log("image link : " + metadata.image);
    const formData2 = new FormData();
    formData2.append('file', JSON.stringify(metadata), { filename: `metadata ${Date.now().toString()}.json` });
    const hashPart2 = await uploadMetadataToIPFS(formData2);
    const metadataHash = pinataIPFSaddress + hashPart2;
    console.log(metadataHash)
    console.log(req.body.attributes);
    const ownerPrivateKey = PRIVATE_KEY;
    const transactionHash = await signAndSendTransaction(ownerPrivateKey, wallet, NFT_CONTRACT_ADDRESS, metadataHash);
    const user = await userModel.findOne({ jwtToken });
    const nft = new nftModel({
      name,
      description,
      image: metadata.image,
      owner: user.name,
      wallet,
      transactionHash,
      attributes,
    });
    nft.save();
    const idNft = nft._id;
    console.log(idNft);
    const getTokenId = async () => {
      const nft = await nftModel.findOne({ _id: idNft });
      console.log(nft);
      const provider = new ethers.providers.WebSocketProvider(API_KEY_LIVE);
      const contractAddress = NFT_CONTRACT_ADDRESS;
      const contractABI = abi;
      const contract = new ethers.Contract(contractAddress, contractABI, provider);

      async function getTokenIDFromMintEvent() {
        const eventName = 'Transfer';

        contract.on(eventName, async (from, to, tokenId, event) => {
          console.log(tokenId.toString());
          nft.tokenId = tokenId.toString();
          await nft.save();
        });
      }

      getTokenIDFromMintEvent().catch(console.error);
    }
    getTokenId();




    res.status(200).json({
      status: 'success',
      message: 'Transaction sent successfully',
      hash: transactionHash,
      nftTokenId: nft.tokenId,
      nftId: nft._id
    });
  } catch (error) {
    console.error('Error minting NFT:', error);
    res.status(500).json({ error: 'An error occurred while minting the NFT.' });
  }
});
const escrowWallet = "0xE15000C8f0e10ab49DBc1319F948B2Fd4593d4A7"
app.post('/list', async (req, res) => {
  const jwtToken = req.headers.authorization;
  const user = await userModel.findOne({ jwtToken });
  const decodedToken = jwt.verify(jwtToken, user.walletAddress);
  const tokenExpirationDate = new Date(decodedToken.exp * 1000);
  if (tokenExpirationDate < new Date()) {
    res.status(401).json({ status: 'error', message: 'Token has expired' });
    return;
  }
  const transHash = req.body.transfer_hash
  const tokenId = req.body.tokenId
  const objId = req.body.objectId
  const price = req.body.price;
  const wallet = req.body.wallet.toUpperCase();
  const provider = new ethers.providers.JsonRpcProvider(API_KEY);
  const getTransactionInfo = async () => {
    try {
      const transaction = await provider.getTransaction(transHash);

      return transaction;


    } catch (err) {
      console.log(err);
    }
  }
  const transaction = await getTransactionInfo();
  console.log("pass til here")
  const transactionVerification = async () => {
    if (transaction.from.toUpperCase() == wallet) {
      const nftContractAddress = await req.body.contractAddress;
      console.log("contract : " + nftContractAddress);

      const provider = new ethers.providers.JsonRpcProvider(API_KEY);
      console.log(provider)
      console.log(nftContractAddress)
      console.log(abi)
      const nftContract = new ethers.Contract(nftContractAddress, abi, provider);
      console.log(nftContract)
      console.log(tokenId)
      console.log(objId)
      const nftOwner = await nftContract.ownerOf(tokenId);


      const tokenUri = await nftContract.tokenURI(tokenId);

      if (nftOwner == escrowWallet) {
        const escrowOwnership = true;
        return {
          tokenUri: tokenUri,
          owner: nftOwner,
          escrowOwnership: escrowOwnership,
        };
      }
      else {
        console.log(
          "nft not in escrow wallet"
        );
      }

    }
    console.log("Not transfered")
    return false;
  }
  const verificationData = await transactionVerification();
  if (verificationData.escrowOwnership) {
    try {

      const nft = await nftModel.findOne({ _id: objId });
      nft.listed = true;
      nft.price = price;
      await nft.save();
      res.send("Listed Succesfully");

    } catch (error) {
      console(error);
    }


  }

});
app.get('/listed-nft', async (req, res) => {
  const jwtToken = req.headers.authorization;
  const user = await userModel.findOne({ jwtToken });
  const decodedToken = jwt.verify(jwtToken, user.walletAddress);
  const tokenExpirationDate = new Date(decodedToken.exp * 1000);
  if (tokenExpirationDate < new Date()) {
    res.status(401).json({ status: 'error', message: 'Token has expired' });
    return;
  }

  const query = { listed: true };
  const listed = await nftModel.find(query);
  console.log(listed);
  res.send(listed);
});
app.get('/nft-details', async (req, res) => {
  const jwtToken = req.headers.authorization;
  const user = await userModel.findOne({ jwtToken });
  const decodedToken = jwt.verify(jwtToken, user.walletAddress);
  const tokenExpirationDate = new Date(decodedToken.exp * 1000);
  if (tokenExpirationDate < new Date()) {
    res.status(401).json({ status: 'error', message: 'Token has expired' });
    return;
  }
const objId=req.body.objectId;
  const query = { _id: objId };
  const selected = await nftModel.findOne (query);
  res.send(selected);
});
app.post('/buy-nft', async (req, res) => {
  const jwtToken = req.headers.authorization;
  const user = await userModel.findOne({ jwtToken });
  const decodedToken = jwt.verify(jwtToken, user.walletAddress);
  const tokenExpirationDate = new Date(decodedToken.exp * 1000);
  if (tokenExpirationDate < new Date()) {
    res.status(401).json({ status: 'error', message: 'Token has expired' });
    return;
  }
  const { nftId, buyer, paymentHash, tokenId } = req.body;
  const nft = await nftModel.findOne({ _id: nftId });
  const nftOwnerWallet = nft.wallet;
  const retailedPrice = nft.price;
  if (nft.listed == false) {
    res.send("NFT NOT FOR SALE");
  }
  const provider = new ethers.providers.JsonRpcProvider(API_KEY);
  const veirfyTransaction = async (paymentHash) => {
    try {
      const transaction = await provider.getTransaction(paymentHash);
      const { to, value, from } = transaction;
      const etherReceived = ethers.utils.formatEther(value);
      console.log('To:', to);
      console.log('from:', from);
      console.log('Ether Received:', etherReceived);
      if (to == escrowWallet && from == buyer && etherReceived >= retailedPrice) {
        return true;
      }
      else{
        return false;
      }

    } catch (error) {
      console.error('Error:', error);
    }
  }
  const transactionValidity=veirfyTransaction(paymentHash);
  if(transactionValidity){
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, abi, wallet);
        async function sendNFT(recipientAddress, tokenId) {
          try {
            const transaction = await contract.transferFrom(wallet.address, recipientAddress, tokenId);
            console.log("NFT sent")
            return (transaction.hash);
          } catch (error) {
            console.error('Error: while sending nft', error);
          }
        }
        await sendNFT(buyer, tokenId);
        async function trasnferToOwner() {
          const fee = (retailedPrice*2)/100
          const toSend = retailedPrice - fee;
          console.log(toSendInEth)
          try{
            const transaction = await wallet.sendTransaction({
              to: nftOwnerWallet,
              value: ethers.utils.parseEther(toSendInEth),
              gasLimit:50000
            });
            return (transaction.hash);
            console.log("value sent to owner address");
          }catch(err){
            res.send(err);
          }
         
        }
        await trasnferToOwner();
        nft.wallet=buyer;
        nft.owner=req.body.buyerName;
        nft.listed=false;

        res.send({
          status:"Success",
          message:"NFT Buying Complete",
          nftTransferHash:nftTransferHash.hash,
        })
      
  }
  else{
    console.log("error in if");
  }
})
app.listen(5000);