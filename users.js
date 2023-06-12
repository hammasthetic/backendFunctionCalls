const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const usersSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique:true
    },
    verified: {
        type: Boolean,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    uname: {
        type: String,
        required: true,
        unique:true
    },
    verificationToken: {
        type: String
    },
    jwtToken:{
        type:String
    },
    walletAddress:{
        type:String,
        require:true
    }
});


module.exports=mongoose.model('users',usersSchema);

