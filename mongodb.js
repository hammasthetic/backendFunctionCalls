const { MongoClient } = require('mongodb');
const url = 'mongodb://localhost:27017';
const mongoose = require('mongoose');
const client = new MongoClient(url);
const dataBase = ('nodeprac')


const dbConnect = async () => {
    let result = await client.connect();
    let db = result.db(dataBase);
    return db.collection('users');

}
module.exports=dbConnect;