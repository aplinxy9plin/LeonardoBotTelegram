var vktoken = require('vk-token');

vktoken.getAccessToken('nikis@sibnet.ru', 'poshelnaxooypidor', function(error, token){
	console.log(token);
});
