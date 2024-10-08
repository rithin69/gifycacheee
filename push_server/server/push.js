// Modules
const webpush = require('web-push')
const urlsafeBase64 = require('urlsafe-base64')
const Storage = require('node-storage')

// Vapid Keys
const vapid = require('./vapid.json')

// Configure web-push
webpush.setVapidDetails(
  'mailto:rithin@gmail.com',
  vapid.publicKey,
  vapid.privateKey
)

// Subscriptions
const store = new Storage(`${__dirname}/db`)
let subscriptions = store.get('subscriptions') || []

// Create URL safe vapid public key
module.exports.getKey = () => urlsafeBase64.decode( vapid.publicKey )

// Store new subscription
module.exports.addSubscription = (subscription) => {

  // Add to subscriptions array
  subscriptions.push(subscription)

  // Persist subscriptions
  store.put('subscriptions', subscriptions)
}

// Send notifications to all registered subscriptions
module.exports.send = (message) => {

  // Notification promises
  let notifications = []

  // Loop subscriptions
  subscriptions.forEach( (subscription, i) => {

    // Send Notification
    let p = webpush.sendNotification( subscription, message )
      .catch( status => {

        // Check for "410 - Gone" status and mark for deletion
        if (status.statusCode === 410)  subscriptions[i]['delete'] = true

        // Return any value
        return null
      })

    // Push notification promise to array
    notifications.push(p)
  })

  // Clean subscriptions marked for deletion
  Promise.all(notifications).then( () => {

    // Filter subscriptions
    subscriptions = subscriptions.filter( subscription => !subscription.delete )

    // Persist 'cleaned' subscriptions
    store.put('subscriptions', subscriptions)
  })
}
