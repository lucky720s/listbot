const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const dataManager = require('./dataManager');
const permissions = require('./utils/permissions');
const messageUtils = require('./utils/messageUtils');
const listHandler = require('./commandHandlers/listHandler');
const nameHandler = require('./commandHandlers/nameHandler');
const adminHandler = require('./commandHandlers/adminHandler');
const utilityHandler = require('./commandHandlers/utilityHandler');

const bot = new TelegramBot(config.token, { polling: true });
console.log('Бот запущен...');

const state = {
    names: dataManager.loadData(config.dataPaths.names, {}),
    lists: dataManager.loadData(config.dataPaths.lists, {}),
    admins: dataManager.loadData(config.dataPaths.admins, [config.mainAdminId]),
    listStatus: dataManager.loadData(config.dataPaths.listStatus, 'off'),

    saveNames: () => dataManager.saveData(config.dataPaths.names, state.names),
    saveLists: () => dataManager.saveData(config.dataPaths.lists, state.lists),
    saveAdmins: () => dataManager.saveData(config.dataPaths.admins, state.admins),
    saveListStatus: () => dataManager.saveData(config.dataPaths.listStatus, state.listStatus)
};

if (!state.admins.includes(String(config.mainAdminId))) {
    state.admins.push(String(config.mainAdminId));
    state.saveAdmins();
}

permissions.initPermissions(state.admins, config.mainAdminId, config.girlsIds);
messageUtils.initMessageUtils(bot, state);
listHandler.initListHandler(bot, state);
nameHandler.initNameHandler(bot, state);
adminHandler.initAdminHandler(bot, state);
utilityHandler.initUtilityHandler(bot, state);

bot.onText(/\/list(?:@\w+)?$/, listHandler.listCommand);
bot.onText(/\/team(?:@\w+)?$/, listHandler.teamCommand);

bot.onText(/\/name(?:@\w+)?\s+(.+)/, nameHandler.nameCommand);
bot.onText(/\/names(?:@\w+)?$/, nameHandler.namesCommand);

bot.onText(/\/status(?:@\w+)?$/, adminHandler.statusCommand);
bot.onText(/\/list(on|off)(?:@\w+)?$/, adminHandler.listToggleCommand);
bot.onText(/\/addadmin(?:@\w+)?\s+(\d+)/, adminHandler.addAdminCommand);
bot.onText(/\/remadmin(?:@\w+)?\s+(\d+)/, adminHandler.removeAdminCommand);
bot.onText(/\/admins(?:@\w+)?$/, adminHandler.adminsCommand);
bot.onText(/\/lists(?:@\w+)?$/, adminHandler.showAllListsCommand);
bot.onText(/\/dellist(?:@\w+)?\s+([\w-]+)/, adminHandler.deleteListCommand);
bot.onText(/\/text(?:@\w+)?\s+(.+)/s, adminHandler.setTextCommand);

bot.onText(/\/all(?:@\w+)?$/, utilityHandler.allCommand);
bot.onText(/\/help(?:@\w+)?$/, utilityHandler.helpCommand);

bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    if (msg.entities && msg.entities.some(e => e.type === 'text_mention' || e.type === 'mention') && msg.reply_to_message) {
        const mentionEntities = msg.entities.filter(e => e.type === 'text_mention' || e.type === 'mention');
        if (mentionEntities.length > 0) {
            const firstToken = msg.text.split(' ')[0];
            if (!isNaN(parseInt(firstToken))) {
                 await listHandler.handleMentionInput(msg, mentionEntities);
                 return;
            }
        }
    }

    if (msg.text && msg.reply_to_message) {
        try {
            await listHandler.handleNumericOrTextListInput(msg);
        } catch (error) {
            if (error.message !== "Cant manage girl") {
                 console.error("Ошибка в handleNumericOrTextListInput:", error);
            }
        }
    }
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error.code, error.message);
});

console.log('Обработчики команд зарегистрированы.');
