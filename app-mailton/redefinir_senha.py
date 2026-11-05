"""Redefine a senha do painel administrativo (use se o Mailton esquecer a senha).

Uso (no terminal, dentro da pasta app-mailton):
    python redefinir_senha.py            -> pergunta uma senha nova e grava no banco
    python redefinir_senha.py --padrao   -> volta para a senha inicial (a do arquivo WSGI / 2020 no teste)

A senha digitada não aparece na tela. Depois disso, quem estiver logado no painel
precisa entrar de novo. Também libera um IP que tenha sido bloqueado por tentativas erradas.
"""
import getpass
import sqlite3
import sys

from werkzeug.security import generate_password_hash

from database import ARQUIVO_BANCO, criar_banco

if __name__ == '__main__':
    criar_banco()  # garante que as tabelas existem
    conn = sqlite3.connect(ARQUIVO_BANCO)

    if '--padrao' in sys.argv:
        with conn:
            conn.execute("DELETE FROM configuracoes WHERE chave = 'admin_senha_hash'")
            conn.execute("DELETE FROM tentativas_login")
        print("Pronto! O painel voltou a usar a senha inicial.")
        raise SystemExit(0)

    nova = getpass.getpass("Nova senha do painel (mínimo 6 caracteres): ")
    repetir = getpass.getpass("Digite a nova senha de novo: ")

    if nova != repetir:
        raise SystemExit("As senhas não são iguais. Nada foi alterado.")
    if len(nova) < 6:
        raise SystemExit("A senha precisa ter pelo menos 6 caracteres. Nada foi alterado.")

    with conn:
        conn.execute(
            "INSERT INTO configuracoes (chave, valor) VALUES ('admin_senha_hash', ?) "
            "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
            (generate_password_hash(nova),)
        )
        conn.execute("DELETE FROM tentativas_login")
    conn.close()
    print("Pronto! Senha redefinida. Quem estava logado no painel precisará entrar de novo.")
