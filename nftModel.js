const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/nodeprac');

const nftSchema = new mongoose.Schema({
  name: String,
  description: String,
  image: String, 
  imageFile:{
    data:Buffer,
    contentType:String
  },
  wallet: String,
  attributes: {
    color: String,
    value:String 
  },
  price:{
    type:Number,
    default:null,
  },
  tokenId:String,
  transactionHash:String,
  owner:{
    type:String
  },
  listed:{
    type:Boolean,
    default:false
  }

});
module.exports=mongoose.model('NFTs',nftSchema);