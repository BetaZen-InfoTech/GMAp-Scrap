require( 'dotenv' ).config();
const express = require( 'express' );
const http = require( 'http' );
const cors = require( 'cors' );
const { Server } = require( 'socket.io' );
const connectDB = require( './config/db' );
const { setupChangeStreams } = require( './services/changeStreams' );

const app = express();
const server = http.createServer( app );

// Socket.IO — polling-only for cPanel/Apache (no WebSocket support)
const io = new Server( server, {
  cors: {
    origin: '*',
    methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS' ],
  },
  transports: [ 'polling' ],
  allowUpgrades: false,
} );

// Store io on app for access in routes if needed
app.set( 'io', io );

// Socket.IO connection handling
io.on( 'connection', ( socket ) =>
{
  console.log( `[Socket.IO] Client connected: ${ socket.id }` );
  socket.on( 'disconnect', () =>
  {
    console.log( `[Socket.IO] Client disconnected: ${ socket.id }` );
  } );
} );

// Connect to MongoDB, then start Change Streams
connectDB().then( () =>
{
  setupChangeStreams( io );
} );

// Middleware
app.use( cors( {
  origin: '*',
  methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS' ],
  allowedHeaders: [ 'Content-Type', 'Authorization', 'X-Requested-With' ],
} ) );
app.use( express.json( { limit: '500mb' } ) );
app.use( express.urlencoded( { extended: true, limit: '500mb' } ) );

// Routes
app.use( '/api', require( './routes' ) );

// Health check
app.get( '/health', ( req, res ) =>
{
  res.json( { status: 'ok', message: 'BetaZen G-Map Scraper API is running' } );
} );

const PORT = process.env.PORT || 5000;
const APP_STATE = process.env.APP_STATE || 'prod';
server.listen( PORT, () =>
{
  console.log( `[Backend] Running on port ${ PORT } | state: ${ APP_STATE } | env: ${ process.env.NODE_ENV }` );
} );
