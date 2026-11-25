"""Cópia de segurança do banco de dados do sistema.

Uso manual (no terminal, dentro da pasta app-mailton):
    python backup.py

Cria uma cópia em backups/wn_beauty_system_AAAAMMDD_HHMMSS.db e mantém só as 30 mais recentes.
No PythonAnywhere, depois é só baixar o arquivo pela aba "Files" (pasta backups).

Automático: o app.py chama garantir_backup_do_dia() na primeira visita de cada dia
(o plano gratuito do PythonAnywhere não tem tarefas agendadas).
"""
import os
import sqlite3
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQUIVO_BANCO = os.path.join(BASE_DIR, 'wn_beauty_system.db')
PASTA_BACKUPS = os.path.join(BASE_DIR, 'backups')
MANTER_ULTIMOS = 30  # com um backup por dia, são 30 dias de histórico (o banco é pequeno)


def garantir_backup_do_dia():
    """Cria o backup de hoje, se ainda não existir um. Devolve o caminho criado ou None."""
    if not os.path.exists(ARQUIVO_BANCO):
        return None
    hoje = datetime.now(timezone(timedelta(hours=-3))).strftime('%Y%m%d')
    if os.path.isdir(PASTA_BACKUPS) and any(
        f.startswith(f'wn_beauty_system_{hoje}') for f in os.listdir(PASTA_BACKUPS)
    ):
        return None
    return fazer_backup()


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