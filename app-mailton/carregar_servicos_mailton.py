"""Carrega os serviços reais do Mailton em um banco que já existe.

Uso (no terminal, dentro da pasta app-mailton, com o servidor parado):
    python database.py
    python carregar_servicos_mailton.py

O que ele faz (de forma segura, pode rodar mais de uma vez):
- Cria os serviços da lista que ainda NÃO existem (confere pelo nome).
- NÃO mexe em serviços que já existem: o tempo e o valor que o Mailton ajustou no painel ficam como estão.
- NÃO apaga serviços que o Mailton criou pelo painel.
- Remove os 3 serviços de exemplo do começo do projeto (se nunca foram agendados;
  se já têm agendamentos, só são ocultados para não perder o histórico).

Opção extra, para quem quer voltar tudo ao padrão da lista:
    python carregar_servicos_mailton.py --atualizar
(sobrescreve tempo, valor e ordem dos serviços da lista que já existem)

Antes de mexer em qualquer coisa, faz um backup automático.
"""
import sqlite3
import sys

from backup import fazer_backup
from database import ARQUIVO_BANCO, SERVICOS_MAILTON, criar_banco

# Serviços de exemplo que vinham no início do projeto, antes dos serviços reais
SERVICOS_DE_EXEMPLO = ['Design de Sobrancelha', 'Micropigmentação', 'Retoque / Manutenção']

if __name__ == '__main__':
    atualizar = '--atualizar' in sys.argv

    criar_banco()  # garante que as colunas novas existem
    caminho = fazer_backup()
    print(f"Backup de segurança criado: {caminho}\n")

    conn = sqlite3.connect(ARQUIVO_BANCO)
    conn.row_factory = sqlite3.Row

    profissional = conn.execute("SELECT id FROM profissionais ORDER BY id LIMIT 1").fetchone()
    if not profissional:
        raise SystemExit("Nenhum profissional encontrado. Rode primeiro: python database.py")
    prof_id = profissional['id']

    nomes_da_lista = {nome for nome, _, _ in SERVICOS_MAILTON}

    with conn:
        for ordem, (nome, duracao, valor) in enumerate(SERVICOS_MAILTON, start=1):
            existente = conn.execute(
                "SELECT id FROM servicos WHERE profissional_id = ? AND nome = ?", (prof_id, nome)
            ).fetchone()
            if existente and atualizar:
                conn.execute(
                    "UPDATE servicos SET duracao_minutos = ?, valor = ?, ordem = ?, ativo = 1 WHERE id = ?",
                    (duracao, valor, ordem, existente['id'])
                )
                print(f"Atualizado:  {nome}")
            elif existente:
                print(f"Já existe:   {nome} (mantido como está)")
            else:
                conn.execute(
                    "INSERT INTO servicos (profissional_id, nome, duracao_minutos, valor, ordem) VALUES (?, ?, ?, ?, ?)",
                    (prof_id, nome, duracao, valor, ordem)
                )
                print(f"Criado:      {nome}")

        # Só os serviços de exemplo saem; qualquer outro serviço (criado pelo Mailton) é preservado
        for exemplo in SERVICOS_DE_EXEMPLO:
            if exemplo in nomes_da_lista:
                continue
            linha = conn.execute(
                "SELECT id FROM servicos WHERE profissional_id = ? AND nome = ?", (prof_id, exemplo)
            ).fetchone()
            if not linha:
                continue
            usos = conn.execute("SELECT COUNT(*) FROM agendamentos WHERE servico_id = ?", (linha['id'],)).fetchone()[0]
            if usos:
                conn.execute("UPDATE servicos SET ativo = 0 WHERE id = ?", (linha['id'],))
                print(f"Ocultado (tem {usos} agendamento(s)): {exemplo}")
            else:
                conn.execute("DELETE FROM servicos WHERE id = ?", (linha['id'],))
                print(f"Removido:    {exemplo}")

    conn.close()
    print("\nPronto! Serviços do Mailton carregados.")
