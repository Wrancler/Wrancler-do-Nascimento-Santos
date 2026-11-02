"""Carrega os serviços reais do Mailton em um banco que já existe.

Uso (no terminal, dentro da pasta app-mailton, com o servidor parado):
    python database.py
    python carregar_servicos_mailton.py

- Serviços com o mesmo nome são atualizados (duração e valor).
- Serviços novos são criados.
- Serviços antigos que não estão na lista: apagados se nunca foram agendados;
  se já têm agendamentos, são apenas desativados (o histórico não se perde).
Antes de mexer, faz um backup automático.
"""
import sqlite3

from backup import fazer_backup
from database import ARQUIVO_BANCO, SERVICOS_MAILTON, criar_banco

if __name__ == '__main__':
    criar_banco()  # garante que as colunas novas existem
    caminho = fazer_backup()
    print(f"Backup de segurança criado: {caminho}\n")

    conn = sqlite3.connect(ARQUIVO_BANCO)
    conn.row_factory = sqlite3.Row

    profissional = conn.execute("SELECT id FROM profissionais ORDER BY id LIMIT 1").fetchone()
    if not profissional:
        raise SystemExit("Nenhum profissional encontrado. Rode primeiro: python database.py")
    prof_id = profissional['id']

    nomes_novos = set()
    with conn:
        for ordem, (nome, duracao, valor) in enumerate(SERVICOS_MAILTON, start=1):
            nomes_novos.add(nome)
            existente = conn.execute(
                "SELECT id FROM servicos WHERE profissional_id = ? AND nome = ?", (prof_id, nome)
            ).fetchone()
            if existente:
                conn.execute(
                    "UPDATE servicos SET duracao_minutos = ?, valor = ?, ordem = ?, ativo = 1 WHERE id = ?",
                    (duracao, valor, ordem, existente['id'])
                )
                print(f"Atualizado: {nome}")
            else:
                conn.execute(
                    "INSERT INTO servicos (profissional_id, nome, duracao_minutos, valor, ordem) VALUES (?, ?, ?, ?, ?)",
                    (prof_id, nome, duracao, valor, ordem)
                )
                print(f"Criado:     {nome}")

        for antigo in conn.execute("SELECT id, nome FROM servicos WHERE profissional_id = ?", (prof_id,)).fetchall():
            if antigo['nome'] in nomes_novos:
                continue
            usos = conn.execute("SELECT COUNT(*) FROM agendamentos WHERE servico_id = ?", (antigo['id'],)).fetchone()[0]
            if usos:
                conn.execute("UPDATE servicos SET ativo = 0 WHERE id = ?", (antigo['id'],))
                print(f"Desativado (tem {usos} agendamento(s)): {antigo['nome']}")
            else:
                conn.execute("DELETE FROM servicos WHERE id = ?", (antigo['id'],))
                print(f"Removido:   {antigo['nome']}")

    conn.close()
    print("\nPronto! Serviços do Mailton carregados.")
