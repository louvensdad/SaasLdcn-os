#!/bin/bash
# Script para executar a coleção Newman com ambiente
# Requer Node.js e newman instalados globalmente (npm install -g newman)

ENVIRONMENT_FILE="environment.json"
COLLECTION_FILE="collection.json"

# Se não existir environment.json, cria um temporário com variáveis padrão
if [ ! -f "$ENVIRONMENT_FILE" ]; then
    echo '{
    "name": "Local Dev",
    "values": [
        {"key": "base_url", "value": "http://localhost:8000", "enabled": true},
        {"key": "email", "value": "teste@exemplo.com", "enabled": true},
        {"key": "username", "value": "teste", "enabled": true},
        {"key": "password", "value": "SenhaForte123!", "enabled": true},
        {"key": "access_token", "value": "", "enabled": false},
        {"key": "refresh_token", "value": "", "enabled": false},
        {"key": "account_id", "value": "", "enabled": true},
        {"key": "instance_id", "value": "", "enabled": true},
        {"key": "macro_id", "value": "", "enabled": true},
        {"key": "log_id", "value": "", "enabled": true},
        {"key": "user_id", "value": "", "enabled": true}
    ]
}' > "$ENVIRONMENT_FILE"
    echo "Arquivo environment.json criado com valores padrão."
fi

echo "Executando a coleção Postman via Newman..."
newman run "$COLLECTION_FILE" -e "$ENVIRONMENT_FILE" --reporters cli,json --reporter-json-export newman_report.json
echo "Teste concluído. Relatório salvo em newman_report.json"