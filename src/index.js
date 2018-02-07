const express = require("express")
const {readFileSync ,writeFileSync} = require("fs")
const moment = require("moment")
const bodyParser = require("body-parser")
const {promisify} = require("util")
const {exec} = require('child_process')

const registry = process.env.SOURCE_REGISTRY
const localRegistry = process.env.LOCAL_REGISTRY
if (!localRegistry || !registry) throw new Error("LOCAL_REGISTRY or SOURCE_REGISTRY environment variable not set!")

const execP = promisify(exec)
 
const app = express()

process.on("unhandledRejection", err => console.log(err.stack || err.message))

let repos = []
const syncTimes = {}
const imageStatus = {}

function reloadRepos() {
  console.log('Reloading repos from filesystem')
  repos = JSON.parse(readFileSync('/var/lib/sync/repos.json').toString())
  console.log('Done,', repos.length, 'repos loaded')
}

function saveRepos() {
  console.log('Saving repos')
  writeFileSync('/var/lib/sync/repos.json', JSON.stringify(repos, null, 2))
  console.log('Done', repos.length, 'saved')
}

reloadRepos()

async function intervalSyncer() {
  console.log("Interval syncer started")

  for (const image of repos) {
    await sync(image)
  }

  console.log("All done, waiting 2 minutes")

  setTimeout(intervalSyncer, 2000 * 60)
}

intervalSyncer()

async function sync(image) {
  console.log("-----> Downloading", image)
  if (image.indexOf(registry) === -1) {
    return console.log(`Skipping ${image} doesn't sit on ${registry}`)
  }

  imageStatus[image] = 'syncing'

  const newImageName = image.replace(registry, localRegistry)

  try {
    console.log(`docker pull ${image}`)
    console.log(await execP(`docker pull ${image}`))
    console.log(await execP(`docker tag ${image} ${newImageName}`))
    console.log(await execP(`docker push ${newImageName}`))
  } catch (ex) {
    console.error(ex)
    console.log('FAILED TO SYNC', image, ex.stack || ex.message)
    imageStatus[image] = 'failed'
    return
  }

  console.log("-----> Finished", image)

  imageStatus[image] = 'done'
  syncTimes[image] = new Date()
}

function queueSync(image) {
  console.log('Manual sync queued for', image)

  sync(image)
}

app.use(bodyParser.urlencoded({
  extended: true
}))

app.post('/add', (req, res) => {
  repos = [
    ...repos,
    req.body.image,
  ]

  console.log('Added', req.body.image)

  saveRepos()

  res.redirect('/')
})

app.post('/delete', (req, res) => {
  repos = repos.filter(repo => repo !== req.body.image)

  console.log('Deleted', req.body.image)

  saveRepos()

  res.redirect('/')
})

app.post('/sync', (req, res) => {
  queueSync(req.body.image)
  res.redirect('/')
})

function syncStatus(repo) {
  const status = imageStatus[repo]

  if (status === 'syncing') {
    return 'syncing now'
  } else if (status === 'failed') {
    return '<span style="color: red">failed</span>'
  } else if (syncTimes[repo]) {
    return moment(syncTimes[repo]).fromNow()
  }

  return 'never'
}

app.get('/', (req, res) => res.send(`
<head>
  <title>Docker Registry Sync</title>
</head>

<h1>Add a new service</h1>
<form action="/add" method="POST">
  <label>
    Image path: (e.g ${registry}/organization/foo-service:optional-tag)<br>
    <input type="text" style="width: 450px" name="image">
  </label>
  <button type="submit">Add</button>
</form>

<hr>

<h1>Current images being synced</h1>

<table style="width: 100%">
  <thead>
    <tr>
      <th style="text-align: left">Image</th>
      <th style="text-align: left">
        Last synced
        <button onclick="window.location.reload()">reload</button>
      </th>
      <th style="text-align: left">Actions</th>
    </tr>
  </thead>
  <tbody>
    ${repos.map(repo => `
    <tr>
      <td>${repo}</td>
      <td>${syncStatus(repo)}</td>
      <td>
        <form action="/sync" method="POST" style="margin: 0; display: inline;">
          <input type="hidden" name="image" value="${repo}">
          <button type="submit">Sync now</button>
        </form>

        <form action="/delete" method="POST" style="margin: 0; display: inline;">
          <input type="hidden" name="image" value="${repo}">
          <button type="submit">Delete</button>
        </form>
      </td>
    </tr>
    `).join('')}
  </tbody>
</table>

<br>
<hr>

`))

app.listen(process.env.PORT || 3000)
