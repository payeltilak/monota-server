const express = require('express')
const cors = require('cors');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;


//middle
app.use(cors({ origin:"http://localhost:3000"}));
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.fpnak.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        res.status(401).send({ message: "Unauthorized access" })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded
        next()
    });
}

async function run() {
    try {
        await client.connect();
        const productCollection = client.db('monota').collection('products');
        const orderCollection = client.db('monota').collection('orders');
        const userCollection = client.db('monota').collection('users');
        const reviewCollection = client.db('monota').collection('reviews');
        
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: "forbidden" })
            }
        }

        app.get('/product', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            res.send(products)
        })
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const product = await productCollection.findOne(query)
            res.send(product);
        });


        // put user to db
        app.put('/user/:email',verifyJWT,verifyAdmin, async (req, res) => {
            const email = req.params.email
            const user = req.body
            console.log('Hit');
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ result, token })
        })



        // put order in orders collection
        app.put('/order',verifyJWT, async (req, res) => {
            const order = req.body
            const filter = {
                email: order.email,
                toolId: order.toolId
            }
            const query = { _id: ObjectId(order.toolId) }
            const exist = await orderCollection.findOne(filter)
            const options = { upsert: true };
            if (exist) {
                const updatedDoc = {
                    $set: {
                        address: order.address,
                        phone: order.phone,
                        quantity: exist.quantity + order.quantity,
                        price: exist.price + order.price
                    }
                }
                const tool = await productCollection.findOne(query)
                const updateTool = {
                    $set: {
                        quantity: tool.quantity - order.quantity
                    }
                }
                const updatedTool = await productCollection.updateOne(query, updateTool, options)
                const updatedOrder = await orderCollection.updateOne(filter, updatedDoc, options)
                return res.send({ updatedOrder, updatedTool })
            }

            else {
                const tool = await productCollection.findOne(query)
                const updateTool = {
                    $set: {
                        quantity: tool.quantity - order.quantity
                    }
                }
                const updatedTool = await productCollection.updateOne(query, updateTool, options)
                const result = await orderCollection.insertOne(order)
                return res.send({ result, updatedTool })
            }
        })

        // user ordered api
        app.get('/myorder', verifyJWT, async (req, res) => {
            const email = req.query.email
            const authorization = req.headers.authorization
            const decodedEmail = req.decoded.email
            if (email === decodedEmail) {
                const query = { email: email }
                const orders = await orderCollection.find(query).toArray()
                return res.send(orders)
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        })

        // add review
        app.post('/addreview',verifyJWT, async (req, res) => {
            const review = req.body
                const result = await reviewCollection.insertOne(review)
                res.send(result)
        })

        // update user
        app.put('/updateduser', verifyJWT, async (req, res) => {
            const email = req.query.email
            const updatedUser = req.body
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: updatedUser.name,
                    img: updatedUser.img,
                    phone: updatedUser.phone,
                    education: updatedUser.education,
                    address: updatedUser.address,
                    linkedin: updatedUser.linkedin
                },
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await userCollection.findOne(query)
            res.send(result)
        })

        // Load all user
        app.get('/alluser', verifyJWT, async (req, res) => {
            const query = {}
            const users = await userCollection.find(query).toArray()
            res.send(users)
        })

        // make admin
        app.put('/user/admin/:email', verifyJWT,  async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)

        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })

        // Handle shift status by admin
        app.patch('/shifted/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    shifted: true
                }
            }
            const result = await orderCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.get('/allorders', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await orderCollection.find().toArray()
            res.send(result)
        })

        app.post('/addproduct', verifyJWT, verifyAdmin, async (req, res) => {
            const tool = req.body
            const result = await productCollection.insertOne(tool)
            res.send(result)
        })
    }
    finally {
        
    }
    
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello Monota')
})

app.listen(port, () => {
    console.log(`Monota app listening on port ${port}`)
})