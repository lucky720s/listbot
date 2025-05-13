# Dockerfile
# Используйте базовый образ Node.js. Рекомендуется LTS версия.
# Alpine-версии меньше по размеру. Убедитесь, что ваша версия Node.js (v20.14.0) совместима.
# Например, node:20-alpine или более конкретно node:20.14.0-alpine
FROM node:20-alpine

# Установка рабочей директории в контейнере
WORKDIR /usr/src/app

# Копируем package.json и package-lock.json (если существует)
COPY package*.json ./

# Устанавливаем зависимости только для production
# npm ci более строгий и быстрый, если у вас есть package-lock.json
# Если package-lock.json нет, используйте: RUN npm install --only=production
RUN npm ci --only=production

# Копируем остальные файлы проекта (исходный код, config.js и т.д.)
# .dockerignore будет определять, какие файлы не копировать
COPY . .

# Создаем директорию data, если она может отсутствовать (хотя volume mount ее перекроет)
# dataManager.js также пытается создать эту директорию при сохранении
RUN mkdir -p data

# Устанавливаем переменную окружения для Node.js
ENV NODE_ENV=production

# Команда для запуска вашего бота
CMD ["node", "bot.js"]
```ignore