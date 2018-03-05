const VK = require('vk-io')
const Telegraf = require('telegraf')
const { Extra, Markup } = require('telegraf')
const request = require('request')
const moment = require('moment')
const tz = require('moment-timezone')
require('moment/locale/en-gb')
const fs = require('fs')
const config = require('./config.json')
const webp = require('webp-converter')
var vktoken = require('vk-token');

var mysql = require('mysql');

var con = mysql.createConnection({
  host: "localhost",
  user: "top4ek",
  password: "q2w3e4r5",
  database: "telegram"
});

con.connect(function(err) {
  con.query("SELECT * FROM leonardo", function (err, result, fields) {
    console.log('Connect to database is successful');
  });
});

const VK_VERSION = '5.65'

const vk = new VK({ token: config.vk_token })
const app = new Telegraf(config.tg_token)

let currentUser
let useName

app.command('start', ({ from , reply}) => {
  var chat_id = from.id
  con.query("SELECT status, chat_id, token FROM leonardo WHERE chat_id = "+chat_id+"", function (err, result, fields) {
    if(result[0] == undefined){
      console.log('empty bitch')
      con.query("INSERT INTO leonardo (chat_id) VALUES ("+from.id+")", function (err, result) {
        reply('Привет, необходимо авторизироваться. Напиши свой логин VK.')
        console.log("User recorded to database");
      });
    }else{
      if(result[0].token == ''){
        reply('Привет, необходимо авторизироваться. Напиши свой логин VK.')
        updateStatus('login_empty',chat_id)
      }else{
        reply('Поехали', Markup
          .keyboard(config.keyboard)
          .resize()
          .extra()
        )
        vk.api.messages.send({
          peer_id: -91050183,
          message: '1',
          v: VK_VERSION
        }).catch((error) => {
          reply('ТОКЕН УСТАРЕЛ. НЕОБХОДИМО РЕАВТОРИЗИРОВАТЬСЯ. НАПИШИ ЛОГИН')
          updateStatus('login_empty',chat_id)
        })
      }
    }
  })
})

app.command('chat_id', ({
  from,
  reply
}) => {
  return reply(from.id)
})


app.on('text', (ctx) => {
  var message = ctx.update.message.text
  var chat_id = ctx.from.id
  con.query("SELECT status, chat_id, token, login, password FROM leonardo WHERE chat_id = "+chat_id+"", function (err, result, fields) {
    if(result[0] == undefined){
      console.log('empty bitch')
      con.query("INSERT INTO leonardo (chat_id, status) VALUES ("+from.id+",'login_empty')", function (err, result) {
        reply('Привет, необходимо авторизироваться. Напиши свой логин VK.')
        console.log("User recorded to database");
      });
    }else{
      var status = result[0].status
      if(status == 'login_empty'){
        if(message !== 'Да' || message !== 'Нет'){
          con.query("UPDATE leonardo SET login = '"+message+"' WHERE chat_id = "+chat_id+"")
          reply('Логин: '+message+' ?', Markup
            .keyboard(['Да','Нет'])
            .resize()
            .extra()
          )
        }else{
          if(message == 'Да'){
            updateStatus('password_empty', chat_id)
            reply('Введите пароль VK')
          }
          if(message == 'Нет'){
            updateStatus('login_empty', chat_id)
            reply('Введите логин VK')
          }
        }
      }
      if(status == 'password_empty'){
        if(message !== 'Да' || message !== 'Нет'){
          con.query("UPDATE leonardo SET password = '"+message+"' WHERE chat_id = "+chat_id+"")
          reply('Пароль: '+message+' ?', Markup
            .keyboard(['Да','Нет'])
            .resize()
            .extra()
          )
        }else{
          if(message == 'Да'){
            updateStatus('data_check', chat_id)
            reply('Ваши данные:\nЛогин: '+result[0].login+'\nПароль: '+result[0].password+'\nВсе верно?', Markup
              .keyboard(['Да','Нет'])
              .resize()
              .extra()
            )
          }
          if(message == 'Нет'){
            updateStatus('password_empty', chat_id)
            reply('Введите логин VK')
          }
        }
      }
      if(status == 'data_check'){
        if(message == 'Да'){
          vktoken.getAccessToken(result[0].login, result[0].password, function(error, token){
          	if(token !== 'notoken'){
              con.query("UPDATE leonardo SET token = '"+token+"' WHERE chat_id = "+chat_id+"")

            }else{
              reply('Данные не верны. Введите логин.')
              updateStatus('login_empty',chat_id)
            }
          });
        }else if(message == 'Нет'){
          reply('Выбирите то, что хотите изменить.', Markup
            .keyboard(['Логин','Пароль'])
            .resize()
            .extra()
          )
          updateStatus('data_change', chat_id)
        }
      }
    }
  })
  if(ctx.update.message.text == 'Мне нравится'){
    message = '1'
  }
  if(ctx.update.message.text == 'Стремная'){
    message = '3'
  }
  /*vk.api.messages.send({
    peer_id: -91050183,
    message: message,
    v: VK_VERSION
  }).catch((error) => {
    console.error(error)
  })*/
})

app.on(['sticker', 'photo'], (ctx) => {
  if (ctx.from.id != config.tg_user) return false
  if (!currentUser) return ctx.reply('❗️Set VK user!❗️')

  let photo = ctx.updateSubTypes.includes('photo')
    ? ctx.update.message.photo[ctx.update.message.photo.length - 1]
    : ctx.update.message.sticker

  return app.telegram.getFileLink(photo).then(file => {
    if (ctx.updateSubTypes.includes('photo'))
      return uploadToVK(file, ctx.update.message.caption)

    let stickerPath = photo.file_id
    if (!fs.existsSync('stickers/')) {
      fs.mkdirSync('stickers/')
    }
    request(file, () => {
      let output = 'stickers/' + stickerPath + '.jpg'
      webp.dwebp('stickers/' + stickerPath, output, "-o", function (status) {
        return uploadToVK(output, ctx.update.message.caption, true)
      })
    }).pipe(fs.createWriteStream('stickers/' + stickerPath))
  })
})

app.on('voice', ctx => {
  if (ctx.from.id != config.tg_user) return false
  if (!currentUser) return ctx.reply('❗️Set VK user!❗️')

  app.telegram.getFileLink(ctx.message.voice).then(link => {
    return vk.upload.voice({
      source: link,
      peer_id: currentUser
    }).then(r => {
      return vk.api.messages.send({
        user_id: currentUser,
        attachment: 'doc' + r.owner_id + '_' + r.id,
        v: VK_VERSION
      })
    })
  }).catch(err => console.error(err))
})

app.catch(err => console.error(err))

app.startPolling()

function uploadToVK(file, text, stream = false) {
  return vk.upload.message({
    source: stream ? fs.createReadStream(file) : file
  }).then((photos) => {

    return vk.api.messages.send({
      user_id: currentUser,
      attachment: 'photo' + photos.owner_id + '_' + photos.id,
      message: text,
      v: VK_VERSION
    })
  })
}

vk.longpoll.start().then(() => {
  console.log('Long Poll is started')
}).catch((error) => {
  console.error(error)
})

vk.longpoll.on('message', (message) => {
  for (let i = 0; i < message.flags.length; i++) {
    if (message.flags[i] == 'outbox') return false
  }
  if(!(message.text >= 0 && message.text <= 10)){
    if(message.peer == -91050183){
      if (Object.keys(message.attachments).length) {
        getMessage(message.id)
        app.telegram.sendMessage(config.tg_user, message.text)
      } else {
        app.telegram.sendMessage(config.tg_user, message.text)
      }
    }
  }
})

function getMessage(id) {
  vk.api.messages.getById({
    message_ids: id,
    v: VK_VERSION
  }).then((message) => {
    message = message.items[0]
    console.log(message.attachments);
    parseAttachments(message.attachments, false)
  }).catch(error => console.error(error))
}

function parseAttachments(attachments, wall) {
  for (let i = 0; i < attachments.length; i++) {
    let atta = attachments[i]
    switch (atta.type) {
      case 'photo':
        let attaimg = atta.photo.photo_1280 || atta.photo.photo_807 || atta.photo.photo_604 || atta.photo.photo_130 || atta.photo.photo_75
        app.telegram.sendPhoto(config.tg_user, attaimg, { caption: atta.photo.text, disable_notification: true },Markup
          .keyboard(config.keyboard)
          .resize()
          .extra())
        break
      case 'video':
        vk.api.video.get({
          videos: atta.video.owner_id + '_' + atta.video.id + '_' + atta.video.access_key,
          v: VK_VERSION
        }).then((video) => {
          let text = wall ? 'Video from wall: ' + video.items[0].player : 'Video: ' + video.items[0].player
          app.telegram.sendMessage(config.tg_user, text, Extra.notifications(false))
        }).catch((error) => {
          console.error(error)
        })
        break
      case 'wall':
        if (atta.wall.text) {
          app.telegram.sendMessage(config.tg_user, 'Post on wall:\n' + atta.wall.text, Extra.notifications(false)).then(() => {
            if (atta.wall.attachments)
              parseAttachments(atta.wall.attachments, true)
          })
        }
        break
      case 'link':
        app.telegram.sendMessage(config.tg_user, 'URL: ' + atta.link.url + '\nTITLE: ' + atta.link.title, Extra.notifications(false))
        break
      case 'sticker':
        app.telegram.sendPhoto(config.tg_user, atta.sticker.photo_256, Extra.notifications(false))
        break
      case 'doc':
        if(atta.doc.type)
          app.telegram.sendVoice(config.tg_user, atta.doc.preview.audio_msg.link_ogg, Extra.notifications(false))
        break
      default:
        app.telegram.sendMessage(config.tg_user, '*' + atta.type + '*', Extra.notifications(false))
    }
  }
}
function updateStatus(status, chat_id){
  con.query("UPDATE leonardo SET status = '"+status+"' WHERE chat_id = "+chat_id+"")
}
