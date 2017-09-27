const request = require('superagent-bluebird-promise');
const _ = require('lodash');
const Promise = require('bluebird');
const sleep = require('system-sleep');
require('dotenv').config();

let accessToken;
let usersUpdated = 0;

function processBatch(page) {
  const users_per_page = 100;
  return request
    .get(`${process.env.AUTH0_TENANT}/api/v2/users`)
    .set('Authorization', 'Bearer ' + accessToken)
    .query({
      per_page: users_per_page,
      include_totals: true,
      fields: 'email,app_metadata,user_id',
      page: page
    })
    .then(res => {
      var string = JSON.stringify(res.headers);
      var objectValue = JSON.parse(string);
      var remaining = objectValue['x-ratelimit-remaining'];
            
      if (remaining < 2) {
        console.log("in delay", remaining);
         var sleepTime = objectValue['x-ratelimit-reset'];
         var ts = Math.round((new Date()).getTime() / 1000);
         sleep(1000); // sleep for 1 second
      }
      page++;

      const users = _.filter(res.body.users, (user) => {
        return _.has(user, 'app_metadata');
      });

      console.log(`Fetched next batch of users, found ${users.length} users with app_metadata.`);

      return Promise.each(users, (user, index, length) => {
        return request
          .patch(`${process.env.AUTH0_TENANT}/api/v2/users/${encodeURIComponent(user.user_id)}`)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            'app_metadata': user.app_metadata
          }).then(res => {
            console.log(`[${++usersUpdated}] Synced app_metadata for ${user.user_id}`)
            var string = JSON.stringify(res.headers);
            var objectValue = JSON.parse(string);
            var remaining = objectValue['x-ratelimit-remaining'];
            
            if (remaining < 2) {
              console.log("in delay", remaining);
              var sleepTime = objectValue['x-ratelimit-reset'];
              var ts = Math.round((new Date()).getTime() / 1000);
              sleep(1000); // sleep for 1 second
            }
            return res;
          });
         
      }).then((results) => {
        if (users_per_page * page < res.body.total) {
          return processBatch(page);
        } else {
          console.log('DONE');
        }
      });
    });
  }

request
  .post(`${process.env.AUTH0_TENANT}/oauth/token`)
  .send({
    grant_type: 'client_credentials',
    client_id: process.env.AUTH0_MGMTAPI_CLIENTID,
    client_secret: process.env.AUTH0_MGMTAPI_CLIENTSECRET,
    audience: `${process.env.AUTH0_TENANT}/api/v2/`
  }).then(res => {
    accessToken = res.body.access_token;
    if (!accessToken) {
      throw new Error('Unable to obtain access token');
    }
    return processBatch(0);
  })
  .catch(err => {
    console.log(err.body);
  });