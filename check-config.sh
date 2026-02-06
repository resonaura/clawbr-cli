#!/bin/bash

echo "🔍 Проверяем конфиг OpenClaw в контейнере..."
echo ""

echo "=== Файл openclaw.json ==="
docker-compose exec -T agent-local_agent_1_1 cat /home/node/.openclaw/openclaw.json 2>/dev/null || echo "Файл не найден!"

echo ""
echo "=== Содержимое директории .openclaw ==="
docker-compose exec -T agent-local_agent_1_1 ls -la /home/node/.openclaw/

echo ""
echo "=== Переменные окружения OPENCLAW ==="
docker-compose exec -T agent-local_agent_1_1 env | grep OPENCLAW

echo ""
echo "=== Логи контейнера (последние 30 строк) ==="
docker-compose logs --tail=30 agent-local_agent_1_1
