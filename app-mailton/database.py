import sqlite3
import os
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQUIVO_BANCO = os.path.join(BASE_DIR, 'wn_beauty_system.db')

# Serviços reais do Mailton: (nome, duração em minutos, valor em R$)
# Tudo isto pode ser editado depois pelo painel admin; aqui é só o ponto de partida.
SERVICOS_MAILTON = [
    ('Design personalizado', 30, 25.00),
    ('Design + henna', 60, 35.00),
    ('Epilação no buço', 30, 10.00),                          # duração a confirmar
    ('Brow lamination', 60, 100.00),                          # duração a confirmar
    ('Micropigmentação fio a fio', 120, 250.00),
    ('Micropigmentação shadow', 120, 250.00),
    ('Retoque de micropigmentação (até 1 mês)', 120, 80.00),
    ('Neutralização de micropigmentação', 60, 75.00),
    ('Super combo (design + henna + esfoliação + buço)', 90, 49.99),  # duração a confirmar
]

# Expediente de partida: segunda a sábado, 09:00-11:30 e 13:00-21:00
# (dia_semana segue o padrão do JavaScript: 0 = domingo ... 6 = sábado)
DIAS_ATENDIMENTO_PADRAO = [1, 2, 3, 4, 5, 6]
FAIXAS_PADRAO = [('09:00', '11:30'), ('13:00', '21:00')]
INTERVALO_PADRAO_MIN = 30


def colunas(cursor, tabela):
    return {linha[1] for linha in cursor.execute(f"PRAGMA table_info({tabela})")}


def criar_banco():
    # Conecta (ou cria) o banco de dados
    conn = sqlite3.connect(ARQUIVO_BANCO)
    cursor = conn.cursor()

    # 1. Tabela de Profissionais
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS profissionais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        nicho TEXT NOT NULL,
        telefone TEXT NOT NULL
    )
    ''')

    # 2. Tabela de Serviços
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profissional_id INTEGER,
        nome TEXT NOT NULL,
        duracao_minutos INTEGER NOT NULL,
        valor REAL NOT NULL,
        FOREIGN KEY(profissional_id) REFERENCES profissionais(id)
    )
    ''')

    # 3. Tabela de Clientes
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL UNIQUE
    )
    ''')

    # 4. Tabela de Agendamentos
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        servico_id INTEGER,
        data_hora DATETIME NOT NULL,
        status TEXT DEFAULT 'agendado', -- pode ser: agendado, cancelado, concluido
        token_cancelamento TEXT UNIQUE, -- Hash único para o link de cancelamento
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(cliente_id) REFERENCES clientes(id),
        FOREIGN KEY(servico_id) REFERENCES servicos(id)
    )
    ''')

    # 5. Controle de meses abertos/fechados
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS meses_abertos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano_mes TEXT UNIQUE NOT NULL, -- Exemplo: '2026-09', '2026-10'
        status TEXT DEFAULT 'fechado' -- 'aberto' ou 'fechado'
    )
    ''')

    # 6. Bloqueios específicos (dias ou horários)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS bloqueios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_bloqueio TEXT NOT NULL, -- Formato: 'YYYY-MM-DD'
        hora_bloqueio TEXT, -- Formato: 'HH:MM' (Se for NULL, o dia todo está bloqueado)
        motivo TEXT
    )
    ''')

    # 7. Expediente: faixas de atendimento por dia da semana (pode haver mais de uma por dia)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS expediente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dia_semana INTEGER NOT NULL, -- 0 = domingo ... 6 = sábado
        inicio TEXT NOT NULL,        -- 'HH:MM'
        fim TEXT NOT NULL            -- 'HH:MM'
    )
    ''')

    # 8. Configurações gerais (chave/valor)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    )
    ''')

    # 8B. Semanas liberadas (só vale quando o Mailton liga "liberar semana por semana")
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS semanas_abertas (
        inicio_semana TEXT PRIMARY KEY -- segunda-feira da semana aberta, 'YYYY-MM-DD'
    )
    ''')

    # 9. Tentativas de login erradas (proteção contra adivinhação de senha)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tentativas_login (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        momento INTEGER NOT NULL
    )
    ''')

    # --- MIGRAÇÕES: bancos criados antes desta versão ganham as colunas novas ---
    if 'ativo' not in colunas(cursor, 'servicos'):
        cursor.execute("ALTER TABLE servicos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1")
    if 'ordem' not in colunas(cursor, 'servicos'):
        cursor.execute("ALTER TABLE servicos ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0")

    # O agendamento guarda a duração e o valor do momento em que foi feito:
    # se o Mailton mudar o preço ou o tempo de um serviço, o histórico e a agenda não se alteram.
    if 'duracao_minutos' not in colunas(cursor, 'agendamentos'):
        cursor.execute("ALTER TABLE agendamentos ADD COLUMN duracao_minutos INTEGER")
    if 'valor' not in colunas(cursor, 'agendamentos'):
        cursor.execute("ALTER TABLE agendamentos ADD COLUMN valor REAL")
    cursor.execute("""UPDATE agendamentos
        SET duracao_minutos = (SELECT s.duracao_minutos FROM servicos s WHERE s.id = agendamentos.servico_id)
        WHERE duracao_minutos IS NULL""")
    cursor.execute("""UPDATE agendamentos
        SET valor = (SELECT s.valor FROM servicos s WHERE s.id = agendamentos.servico_id)
        WHERE valor IS NULL""")

    if 'imagem' not in colunas(cursor, 'servicos'):
        cursor.execute("ALTER TABLE servicos ADD COLUMN imagem TEXT")

    # --- VALORES INICIAIS ---
    # Abre por padrão o mês atual e o próximo (o Mailton controla o resto pelo painel)
    hoje = datetime.now(timezone(timedelta(hours=-3)))
    proximo = (hoje.replace(day=1) + timedelta(days=32)).replace(day=1)
    for ref in (hoje, proximo):
        cursor.execute(
            "INSERT OR IGNORE INTO meses_abertos (ano_mes, status) VALUES (?, 'aberto')",
            (ref.strftime('%Y-%m'),)
        )

    cursor.execute("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('intervalo_min', ?)",
                   (str(INTERVALO_PADRAO_MIN),))

    cursor.execute("SELECT COUNT(*) FROM expediente")
    if cursor.fetchone()[0] == 0:
        for dia in DIAS_ATENDIMENTO_PADRAO:
            for inicio, fim in FAIXAS_PADRAO:
                cursor.execute("INSERT INTO expediente (dia_semana, inicio, fim) VALUES (?, ?, ?)",
                               (dia, inicio, fim))

    # Banco novo: cria o profissional e os serviços reais
    cursor.execute("SELECT COUNT(*) FROM profissionais")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO profissionais (nome, nicho, telefone) VALUES ('Mailton Maia', 'Sobrancelhas e Micropigmentação', '5583988856096')"
        )
        mailton_id = cursor.lastrowid
        for ordem, (nome, duracao, valor) in enumerate(SERVICOS_MAILTON, start=1):
            cursor.execute(
                "INSERT INTO servicos (profissional_id, nome, duracao_minutos, valor, ordem) VALUES (?, ?, ?, ?, ?)",
                (mailton_id, nome, duracao, valor, ordem)
            )
        print("Banco de dados criado com os serviços do Mailton!")

    conn.commit()
    conn.close()


if __name__ == '__main__':
    criar_banco()
    print("Banco de dados atualizado.")
