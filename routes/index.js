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
router.get( '/session', ( req, res ) => {
  res.redirect( '/room/session' );
} );

/**
 * GET /room/:name
 */
router.get( '/room/:name', ( req, res ) => {
  const { name: roomName } = req.params;
  let sessionId;
  let token;
  console.log( `Attempting to create a session associated with the room: ${roomName}` );

  // if the room name is associated with a session ID, fetch that
  if ( roomToSessionIdDictionary[roomName] ) {
    sessionId = roomToSessionIdDictionary[roomName];

    // generate token
    token = opentok.generateToken( sessionId );
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
      token = opentok.generateToken( sessionId );
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
  console.log( '==========>', req );
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

/**
 * GET /archive/:archiveId
 */
router.get( '/archive/:archiveId', ( req, res ) => {
  const { archiveId } = req.params;

  // fetch archive
  console.log( `Attempting to fetch archive: ${archiveId}` );
  opentok.getArchive( archiveId, ( err, archive ) => {
    if ( err ) {
      console.error( 'Error in getArchive' );
      console.error( err );
      res.status( 500 )
         .send( { error: `getArchive error: ${err}` } );
      return;
    }

    // extract as a JSON object
    res.setHeader( 'Content-Type', 'application/json' );
    res.send( archive );
  } );
} );

/**
 * GET /archive
 */
router.get( '/archive', ( req, res ) => {
  const options = {};
  const { count, offset } = req.query;
  if ( count ) {
    options.count = count;
  }
  if ( offset ) {
    options.offset = offset;
  }

  // list archives
  console.log( 'Attempting to list archives' );
  opentok.listArchives( options, ( err, archives ) => {
    if ( err ) {
      console.error( 'Error in listArchives' );
      console.error( err );
      res.status( 500 )
         .send( { error: `infoArchive error: ${err}` } );
      return;
    }

    // extract as a JSON object
    res.setHeader( 'Content-Type', 'application/json' );
    res.send( archives );
  } );
} );

module.exports = router;