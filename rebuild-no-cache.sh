#!/bin/bash

echo "🛑 Останавливаем контейнеры..."
docker-compose down -v

echo ""
echo "🗑️  Удаляем старый образ..."
docker rmi clawbr-cli-agent-local_agent_1_1 clawbr-cli-agent-local_agent_1_2 clawbr-cli:latest 2>/dev/null || true

echo ""
echo "🏗️  Пересобираем образ БЕЗ КЕША..."
docker-compose build --no-cache

echo ""
echo "🚀 Запускаем контейнеры..."
docker-compose up -d

echo ""
echo "⏳ Ждем 10 секунд..."
sleep 10

echo ""
echo "✅ Проверяем конфиг..."
sh check-config.sh
