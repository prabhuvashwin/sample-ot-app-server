const express = require( 'express' );
const router = express.Router();
const path = require('path');
const _ = require('lodash');

const apiKey = process.env.TOKBOX_API_KEY;
const secret = process.env.TOKBOX_SECRET;

if ( !apiKey || !secret ) {
  console.error( '=========================================================================================================' );
  console.error( '' );
  console.error( 'Missing TOKBOX_API_KEY or TOKBOX_SECRET' );
  console.error( 'Find the appropriate values for these by logging into your TokBox Dashboard at: https://tokbox.com/account/#/' );
  console.error( `Then add them to ${path.resolve('.env')} or as environment variables` );
  console.error( '' );
  console.error( '=========================================================================================================' );
  process.exit();
}

const OpenTok = require( 'opentok' );
const opentok = new OpenTok( apiKey, secret );

let _broadcastId = "";

// IMPORTANT: roomToSessionIdDictionary is a variable that associates room names with unique
// unique sesssion IDs. However, since this is stored in memory, restarting your server will
// reset these values if you want to have a room-to-session association in your production
// application you should consider a more persistent storage

var roomToSessionIdDictionary = {};

// returns the room name, given a session ID that was associated with it
const findRoomFromSessionId = sessionId => _.findKey( roomToSessionIdDictionary, value => ( value === sessionId ) );

router.get( '/', ( req, res ) => {
  res.render( 'index', { title: 'Sample-OT-App-Server' } )
} );

/**
 * GET /session redirects to /room/session
 */
router.get( '/session/:name', ( req, res ) => {
  const { name } = req.params;
  res.redirect( `/room/session/${name}` );
} );

/**
 * GET /room/:name
 */
router.get( '/room/:name/:connectionName', ( req, res ) => {
  const { name: roomName, connectionName } = req.params;
  let sessionId;
  let token;
  console.log( `Attempting to create a session associated with the room: ${roomName}` );

  // if the room name is associated with a session ID, fetch that
  if ( roomToSessionIdDictionary[roomName] ) {
    sessionId = roomToSessionIdDictionary[roomName];

    // generate token
    token = opentok.generateToken( sessionId, { data: connectionName } );
    res.setHeader( 'Content-Type', 'application/json' );
    res.send( { apiKey, sessionId, token } );
  }
  // if this is the first time the room is being accessed, create a new session ID
  else {
    opentok.createSession( { mediaMode: 'routed' }, ( err, session ) => {
      if ( err ) {
        console.log( err );
        res.status( 500 )
           .send( { error: `createSession error: ${err}` } );
        return;
      }

      // now that the room name has a session associated with it, store it in memory
      // IMPORTANT: Because this is stored in memory, restarting your server will reset these values
      // if you want to store a room-to-session association in your production application
      // you should use a more persistent storage for them
      sessionId = session.sessionId;
      roomToSessionIdDictionary[roomName] = sessionId;

      // generate token
      token = opentok.generateToken( sessionId, { data: connectionName } );
      res.setHeader( 'Content-Type', 'application/json' );
      res.send( { apiKey, sessionId, token } );
    } );
  }
} );

/**
 * POST /archive/start
 */
router.post( '/archive/start', ( req, res ) => {
  const json = req.body;
  const { sessionId } = json;
  opentok.startArchive( sessionId, { name: findRoomFromSessionId( sessionId ) }, ( err, archive ) => {
    if ( err ) {
      console.error( 'Error in startArchive' );
      console.error( err );
      res.status( 500 )
         .send( { error: `startArchive error: ${err}` } );
      return;
    }
    res.setHeader( 'Content-Type', 'application/json' );
    res.send( archive );
  } );
} );

/**
 * POST /archive/:archiveId/stop
 */
router.post( '/archive/:archiveId/stop', ( req, res ) => {
  const { archiveId } = req.params;
  console.log( `Attempting to stop archive: ${archiveId}` );
  opentok.stopArchive( archiveId, ( err, archive ) => {
    if ( err ) {
      console.error( 'Error in stopArchive' );
      console.error( err );
      res.status( 500 )
         .send( { error: `stopArchive error: ${err}` } );
      return;
    }
    res.setHeader( 'Content-Type', 'application/json' );
    res.send( archive );
  } );
} );

/**
 * GET /archive/:archiveId/view
 */
router.get( '/archive/:archiveId/view', ( req, res ) => {
  const { archiveId } = req.params;
  console.log( `Attempting to view archive: ${archiveId}` );
  opentok.getArchive( archiveId, ( err, archive ) => {
    if ( err ) {
      console.error( 'Error in getArchive' );
      console.error( err );
      res.status( 500 )
         .send( { error: `getArchive error: ${err}` } );
      return;
    }

    if ( archive.status === 'available' ) {
      res.redirect( archive.url );
    } else {
      res.render( 'view', { title: 'Archiving Pending' } );
    }
  } );
} );

router.post( '/broadcast/start', ( req, res ) => {
  const json = req.body;
  const { sessionId, maxDuration, resolution, layout, hls = {} } = json;

  const broadcastOptions = {
    maxDuration,
    resolution,
    layout,
    outputs: {
      hls
    }
  };

  opentok.startBroadcast( sessionId, broadcastOptions, ( err, broadcast ) => {
    if ( err ) {
      return res.send( 500, err.message );
    }

    _broadcastId = broadcast.id;

    return res.json( broadcast );
  } );
} );

router.get( '/broadcast/:broadcastId/stop', ( req, res ) => {
  const { broadcastId } = req.params;

  opentok.stopBroadcast( broadcastId, ( err, broadcast ) => {
    if ( err ) {
      return res.send( 500, err.message );
    }

    return res.json( broadcast );
  } );
} );

router.get( '/broadcast/id', ( req, res ) => {
  if ( !_broadcastId ) return res.json( { broadcastId: null } );

  return res.json( { broadcastId: _broadcastId } );
} );

router.get( '/broadcast/:broadcastId/view', ( req, res ) => {
  const { broadcastId } = req.params;
  console.log( `Attempting to view broadcast: ${broadcastId}` );
  
  return opentok.getBroadcast( broadcastId, ( err, broadcast ) => {
    if ( err ) {
      console.error( 'Error in getBroadcast: ', err );
      res.status( 500 )
         .send( { error: `getBroadcast error: ${err}` } );
      return;
    }

    return res.json( broadcast );
  } );
} );

module.exports = router;