"""Cópia de segurança do banco de dados do sistema.

Uso (no terminal, dentro da pasta app-mailton):
    python backup.py

Cria uma cópia em backups/wn_beauty_system_AAAAMMDD_HHMM.db e mantém só as 10 mais recentes.
No PythonAnywhere, depois é só baixar o arquivo pela aba "Files" (pasta backups).
"""
import os
import sqlite3
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQUIVO_BANCO = os.path.join(BASE_DIR, 'wn_beauty_system.db')
PASTA_BACKUPS = os.path.join(BASE_DIR, 'backups')
MANTER_ULTIMOS = 10


def fazer_backup():
    os.makedirs(PASTA_BACKUPS, exist_ok=True)

    # Horário de Brasília, mesmo que o servidor esteja em UTC
    agora = datetime.now(timezone(timedelta(hours=-3))).strftime('%Y%m%d_%H%M%S')
    destino = os.path.join(PASTA_BACKUPS, f'wn_beauty_system_{agora}.db')

    origem = sqlite3.connect(ARQUIVO_BANCO)
    copia = sqlite3.connect(destino)
    try:
        # API oficial do SQLite: gera uma cópia consistente mesmo com o site em uso
        origem.backup(copia)
    finally:
        copia.close()
        origem.close()

    # Apaga os backups mais antigos, deixando só os últimos
    arquivos = sorted(
        f for f in os.listdir(PASTA_BACKUPS)
        if f.startswith('wn_beauty_system_') and f.endswith('.db')
    )
    for antigo in arquivos[:-MANTER_ULTIMOS]:
        os.remove(os.path.join(PASTA_BACKUPS, antigo))

    return destino


if __name__ == '__main__':
    caminho = fazer_backup()
    print(f"Backup criado: {caminho}")
