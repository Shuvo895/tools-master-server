const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;



app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wr58j.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



function verifyJWT(req, res, next) {
	const authHeader = req.headers.authorization;
	console.log(authHeader);
	if(!authHeader){
	  return res.status(401).send({message: 'UnAuthorized Access 😆'});
	}
	const token = authHeader.split(' ')[1];
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
	  if(err){
		return res.status(403).send({message: 'Forbidden Access 😭'});
	  }
	  req.decoded = decoded;
	  next();
	});
  }




async function run() {
	try{
		await client.connect();
		const toolsCollections = client.db('tool_master_db').collection('tools');
		const usersCollections = client.db('tool_master_db').collection('users');
		const ordersCollections = client.db('tool_master_db').collection('orders');
		const paymentsCollections = client.db('tool_master_db').collection('payments');
		const reviewsCollections = client.db('tool_master_db').collection('reviews');

		console.log('mongodb connected');

		// verify admin
		const verifyAdmin = async (req,res,next) => {
			const requesterEmail = req.decoded.email;
			const requesterAccount = await usersCollections.findOne({email: requesterEmail}); 
			if(requesterAccount.role === 'admin'){
			  next();
			} else {
			  res.status(403).send({message: 'Forbidden Access 😭'});
			}
		  }

		// get all tools
		app.get('/tools', async(req, res) => {
			const result = await toolsCollections.find().toArray();
			res.send(result);
		})

		// delete a tool by id from admin
		app.delete('/tools/:id', verifyJWT, verifyAdmin, async(req,res) => {
			const id = req.params.id;
			const filter = {_id: ObjectId(id)};
			const result = await toolsCollections.deleteOne(filter);
			res.send(result);
		})

		// add user 1st time when they signup
		app.put('/user/:email', async(req, res) => {
			const email = req.params.email;
			const user = req.body;
			const filter = {email: email};
			const optoins = {upsert: true};
			const updatedDocument = {
				$set: user
			}
			const result = await usersCollections.updateOne(filter, updatedDocument, optoins);
			const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});
			res.send({result, token});
		})
		
		// get tools by id
		app.get('/tools/:id', async(req,res) => {
			const id = req.params.id;
			const query = {_id: ObjectId(id)}
			const result = await toolsCollections.findOne(query);
			res.send(result);
		})
		
		// order in tools
		app.post('/orders', async(req,res) => {
			const doc = req.body;
			const result = await ordersCollections.insertOne(doc);
			res.send(result);
		})
	
		// get order by user email
		app.get('/myorders/:email', async(req, res) => {
			const email = req.params.email;
			const query = {email:email};
			const result = await ordersCollections.find(query).toArray();
			res.send(result);
		})
		
		// get order by id
		app.get('/orders/:id', async(req, res) => {
			const id = req.params.id;
			const query = {_id: ObjectId(id)};
			const result = await ordersCollections.findOne(query);
			res.send(result);
		})

		// make payment in stripe
		app.post("/create-payment-intent", async (req, res) => {
			const {price} = req.body;
			const amount = parseInt(price) * 1000;
			const paymentIntent = await stripe.paymentIntents.create({
				amount: amount,
				currency: "usd",
				payment_method_types:['card']
			});
			res.send({
				clientSecret: paymentIntent.client_secret,
			});
		})
		// after payment 
		app.patch('/paymentOrders/:id', async(req, res) => {
			const id = req.params.id;
			const payment = req.body;
			console.log(payment);
			const filter = {_id: ObjectId(id)};
			const updatedDoc = {
				$set: {
					paid: true,
					transactionId: payment.transactionId,
				}
			}
			const updatedOrders = await ordersCollections.updateOne(filter, updatedDoc);
			const result = await paymentsCollections.insertOne(payment);
			res.send(updatedOrders);
		})

		// cancel order by user
		app.delete('/myorders/:id', async(req, res) => {
			const id = req.params.id;
			const query = {_id: ObjectId(id)};
			const result = await ordersCollections.deleteOne(query);
			res.send(result);
			// res.send({message:'ok'});
		})

		// Add a review by user
		app.post('/addreview', async(req, res) => {
			const doc = req.body;
			const result = await reviewsCollections.insertOne(doc);
			res.send(result);
		})

		// update user profile
		app.put('/profile/:email', async(req, res) => {
			const email = req.params.email;
			const doc = req.body;
			const filter = {email: email};
			const updateDoc = {
				$set: doc
			}
			const result = await usersCollections.updateOne(filter,updateDoc);
			res.send(result);
		})

		// my user profile get
		app.get('/profile/:email',verifyJWT,async(req, res) => {
			const email = req.params.email;
			const decodedEmail = req.decoded.email;
			if(email === decodedEmail){
				const query = {email: email};
				const result = await usersCollections.findOne(query);
				res.send(result);
			} else{
				return res.status(403).send({message: 'Forbidden Access 😭'});
			}
			
		})

		// check admin
		app.get('/admin/:email', async(req, res) => {
			const email = req.params.email;
			const user = await usersCollections.findOne({email: email});
			// console.log(user);
			const admin = user.role === 'admin';
			// console.log(admin);
			res.send({admin});
		})

		// get all user
		app.get('/user', async(req, res) => {
			const result = await usersCollections.find().toArray();
			res.send(result);
		})

		// make admin
		app.put('/makeAdmin/:email',verifyJWT, verifyAdmin , async(req, res) => {
			const email = req.params.email;
			const filter = {email: email};
			const updateDoc = {
				$set: {role:'admin'},
			}
			const result = await usersCollections.updateOne(filter, updateDoc);
     		res.send(result);
		})

		// add tool from admin
		app.post('/addTool', verifyJWT, verifyAdmin, async(req, res) => {
			const doc = req.body;
			const result = await toolsCollections.insertOne(doc);
			res.send(result);
		})

		// get order for manage
		app.get('/manageOrder',verifyJWT, async(req, res) => {
			const result = await ordersCollections.find().toArray();
			res.send(result);
		})
		
		// add shipping true in order Collections
		app.put('/manageOrder/:id', verifyJWT, verifyAdmin, async(req, res ) => {
			const id = req.params.id;
			const filter = {_id: ObjectId(id)};
			const options = { upsert: true };
			const updateDoc = {
				$set: {
				  shipping: true,
				},
			};
			const result = await ordersCollections.updateOne(filter, updateDoc, options);
			res.send(result);
		})

		// delete unpaid order from admin
		app.delete('/manageOrder/:id', verifyJWT, verifyAdmin, async(req, res) => {
			const id = req.params.id;
			const filter = {_id: ObjectId(id)};
			const result = await ordersCollections.deleteOne(filter);
			res.send(result);
		})

		// get all review
		app.get('/review', async(req, res) => {
			const result = await reviewsCollections.find().toArray();
			res.send(result);
		})
	}
	finally{

	}
}
run().catch(console.dir);




app.get('/', (req, res) => {
	res.send(`Tool Master Server running on port ${port}`);
  })
  
app.listen(port, () => {
console.log(`Tools Master server running on port ${port}`);
})