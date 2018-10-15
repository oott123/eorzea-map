const { MWBot } = require('mediawiki2')
const config = require('../config')
const glob = require('glob')
const fs = require('fs')
const path = require('path')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const shortid = require('shortid')
const Bluebird = require('bluebird')

async function upload() {
  const bot = new MWBot('https://ff14.huijiwiki.com/w/api.php')
  await bot.login(config.huiji.username, config.huiji.password)

  const action = process.argv[2]

  if (action === 'icon' || action === 'minimap') {
    // 上传 icon or minimap
    const files = glob.sync(`generated/webroot/${action}/*.png`)
    for (const file of files) {
      try {
        await uploadFile(bot, file, path.basename(file))
      } catch (e) {
        console.log(e.message)
      }
    }
  }

  // if (process.env.UPLOAD_TILE) {
  //   // 上传图片
  //   const tiles = glob.sync('generated/webroot/tiles/r2f1_00/*.jpg')
  //   for (const tile of tiles) {
  //     try {
  //       const filename =
  //         'EorzeaMapTile_' + tile.match(/tiles\/(.*)$/)[1].replace(/\//g, '_')
  //       await uploadFile(bot, tile, filename)
  //     } catch (e) {
  //       console.log(e.message)
  //     }
  //   }
  // }

  if (action === 'tile') {
    const adapter = new FileSync('generated/huiji_upload_tiles.db.json')
    const db = low(adapter)
    db.defaults({ tiles: [], first: true }).write()
    if (db.get('first').value()) {
      console.log('首次上传，正在生成数据库……')
      const tiles = glob
        .sync('generated/webroot/tiles/**/*.jpg')
        .map(filename => {
          return {
            id: shortid.generate(),
            filename,
            uploadedAt: null
          }
        })
      db.set('first', false)
        .set('tiles', tiles)
        .write()
    }
    while (true) {
      const toUpload = db
        .get('tiles')
        .filter(s => s.uploadedAt === null)
        .take(3)
        .value()
      if (toUpload.length < 1) {
        break
      }
      await Bluebird.map(toUpload, async tile => {
        try {
          const filename =
            'EorzeaMapTile_' +
            tile.filename.match(/tiles\/(.*)$/)[1].replace(/\//g, '_')
          await uploadFile(bot, tile.filename, filename)
          tile.uploadedAt = Date.now()
        } catch (e) {
          console.error(e)
        }
        return tile
      })
      db.write()
    }
  }

  if (action === 'data') {
    await updateData(bot, 'generated/webroot/data/map.json', 'map.json', true)
    await updateData(
      bot,
      'generated/webroot/data/mapMarker.json',
      'mapMarker.json',
      true
    )
    await updateData(
      bot,
      'generated/webroot/data/region.json',
      'region.json',
      true
    )
  }

  // await uploadFile(
  //   bot,
  //   'generated/webroot/files/bg.jpg',
  //   'EorzeaMapAssets_bg.jpg'
  // )

  if (!action) {
    await updateGadget(bot, 'huiji/loader.js', 'EorzeaMapLoader.js')
    await updateGadget(bot, 'huiji/loader.css', 'EorzeaMapLoader.css')
    await updateGadget(bot, 'dist/map.css', 'EorzeaMap.css')
    await updateGadget(bot, 'dist/map.js', 'EorzeaMap.js')
  }
}

async function uploadFile(bot, src, dest, desc) {
  console.log(`Uploading ${dest} ...`)
  return bot.simpleUpload({
    file: src,
    filename: dest,
    ignorewarnings: true,
    comment: desc || '游戏解包图标/地图数据 by [[用户:云泽宛风]]'
  })
}

async function updateGadget(bot, src, dest) {
  console.log(`Updating ${dest} ...`)
  const content = fs.readFileSync(src).toString()
  await bot.edit({
    title: `Gadget:${dest}`,
    text: content,
    summary: '自动化脚本更新代码，有问题请联系 [[用户:云泽宛风]]',
    nocreate: true,
    bot: true,
    token: bot.editToken
  })
}

async function updateData(bot, src, dest, wrap = false) {
  console.log(`Updating ${dest} ...`)
  let content = fs.readFileSync(src).toString()
  if (wrap) {
    content = JSON.stringify({ data: JSON.parse(content) })
  }
  await bot.edit({
    title: `Data:EorzeaMap/${dest}`,
    text: content,
    summary: '自动化脚本更新数据，有问题请联系 [[用户:云泽宛风]]',
    bot: true,
    token: bot.editToken
  })
}

upload()
