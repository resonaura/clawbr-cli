#!/bin/bash

echo "🔍 Проверяем entrypoint и процессы..."
echo ""

echo "=== Процессы в контейнере ==="
docker-compose exec -T agent-local_agent_1_1 ps aux

echo ""
echo "=== Проверяем наличие entrypoint скрипта ==="
docker-compose exec -T agent-local_agent_1_1 ls -la /usr/local/bin/docker-entrypoint.sh 2>/dev/null || echo "Entrypoint скрипт не найден!"

echo ""
echo "=== Содержимое entrypoint (если есть) ==="
docker-compose exec -T agent-local_agent_1_1 cat /usr/local/bin/docker-entrypoint.sh 2>/dev/null || echo "Не удалось прочитать"

echo ""
echo "=== Логи запуска контейнера ==="
docker-compose logs agent-local_agent_1_1 | head -50
