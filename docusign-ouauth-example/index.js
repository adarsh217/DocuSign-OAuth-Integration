const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const https = require('https');
const { URLSearchParams } = require('url');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'my-secret-key',
  resave: false,
  saveUninitialized: true
}));

dotenv.config();

const docuSignAuthUrl = 'https://account.docusign.com/oauth/auth';
const docuSignTokenUrl = 'https://account.docusign.com/oauth/token';
const docuSignApiUrl = 'https://demo.docusign.net/restapi/v2.1';

const clientId = process.env.DS_CLIENT_ID;
const clientSecret = process.env.DS_CLIENT_SECRET;
const redirectUri = process.env.DS_REDIRECT_URI;

const scopes = 'signature%20impersonation';

function getAuthorizationUrl(req, res) {
  const state = Math.random().toString(36).substring(7);
  req.session.state = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state
  });

  const authUrl = `${docuSignAuthUrl}?${params.toString()}`;

  res.redirect(authUrl);
}

function getToken(req, res) {
  const { code, state } = req.query;

  if (state !== req.session.state) {
    res.status(401).send('Unauthorized');
    return;
  }

  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  const options = {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  const request = https.request(docuSignTokenUrl, options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      const tokenData = JSON.parse(data);
      req.session.accessToken = tokenData.access_token;
      res.redirect('/templates');
    });
  });

  request.on('error', (error) => {
    console.error(error);
    res.status(500).send('Internal Server Error');
  });

  request.write(data.toString());
  request.end();
}

function getTemplates(req, res) {
  const accessToken = req.session.accessToken;
  const url = `${docuSignApiUrl}/templates`;
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    secureProtocol: 'TLSv1_2_method'
  };

  const request = https.request(url, options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      const templates = JSON.parse(data);
      res.render('templates', { templates });
    });
  });

  request.on('error', (error) => {
    console.error(error);
    res.status(500).send('Internal Server Error');
  });

  request.end();
}

function createEnvelope(req, res) {
  const accessToken = req.session.accessToken;
  const url = `${docuSignApiUrl}/envelopes`;
  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    secureProtocol: 'TLSv1_2_method'
  };

  const envelope = {
    templateId: req.body.templateId,
    templateRoles: [
      {
        email: req.body.email,
        name: req.body.name,
        roleName: req.body.roleName
      }
    ],
    status: 'sent'
  };

  const request = https.request(url, options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      const envelopeResponse = JSON.parse(data);
      res.render('envelope', { envelope: envelopeResponse });
    });
  });

  request.on('error', (error) => {
    console.error(error);
    res.status(500).send('Internal Server Error');
  });

  request.write(JSON.stringify(envelope));
  request.end();
}
