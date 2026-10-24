"""Apaga os dados de TESTE antes de entregar o sistema ao Mailton.

Uso (no terminal, dentro da pasta app-mailton):
    python limpar_testes.py

Apaga: agendamentos, clientes e bloqueios.
Mantém: profissional, serviços e meses abertos/fechados.
Antes de apagar, faz um backup automático e pede confirmação.
"""
import os
import sqlite3

from backup import fazer_backup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQUIVO_BANCO = os.path.join(BASE_DIR, 'wn_beauty_system.db')
TABELAS_A_LIMPAR = ['agendamentos', 'clientes', 'bloqueios']


def contar(conn, tabela):
    return conn.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0]


if __name__ == '__main__':
    conn = sqlite3.connect(ARQUIVO_BANCO)

    print("Registros que serão apagados:")
    for tabela in TABELAS_A_LIMPAR:
        print(f"  - {tabela}: {contar(conn, tabela)}")
    print("Serviços, profissional e meses abertos NÃO serão apagados.\n")

    resposta = input("Digite LIMPAR para confirmar: ").strip()
    if resposta != 'LIMPAR':
        print("Cancelado. Nada foi apagado.")
        conn.close()
        raise SystemExit(0)

    caminho = fazer_backup()
    print(f"Backup de segurança criado: {caminho}")

    with conn:
        # Ordem importa: agendamentos dependem de clientes
        for tabela in TABELAS_A_LIMPAR:
            conn.execute(f"DELETE FROM {tabela}")
        # Zera a contagem de IDs para o primeiro agendamento real ser o número 1
        marcadores = ','.join('?' for _ in TABELAS_A_LIMPAR)
        conn.execute(f"DELETE FROM sqlite_sequence WHERE name IN ({marcadores})", TABELAS_A_LIMPAR)
    conn.close()

    print("Pronto! Dados de teste apagados.")
