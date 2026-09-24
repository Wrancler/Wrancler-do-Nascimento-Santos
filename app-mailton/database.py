import sqlite3
import uuid

def criar_banco():
    # Conecta (ou cria) o banco de dados
    conn = sqlite3.connect('wn_beauty_system.db')
    cursor = conn.cursor()

    # 1. Tabela de Profissionais (Para suportar vários clientes no seu SaaS)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS profissionais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        nicho TEXT NOT NULL,
        telefone TEXT NOT NULL
    )
    ''')

    # 2. Tabela de Serviços (Cada profissional tem os seus)
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

    # 4. Tabela de Agendamentos (O Coração do Sistema)
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

    # 5. Tabela de Controlo de Meses (Autonomia do Profissional)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS meses_abertos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano_mes TEXT UNIQUE NOT NULL, -- Exemplo: '2026-09', '2026-10'
        status TEXT DEFAULT 'fechado' -- 'aberto' ou 'fechado'
    )
    ''')
    
    # Insere o mês atual como aberto por padrão para testes
    cursor.execute("INSERT OR IGNORE INTO meses_abertos (ano_mes, status) VALUES ('2026-09', 'aberto')")

    # --- DADOS DE TESTE PARA O MAILTON ---
    # Vamos inserir o Mailton e os serviços dele para podermos testar a API
    cursor.execute("SELECT COUNT(*) FROM profissionais")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO profissionais (nome, nicho, telefone) VALUES ('Mailton Maia', 'Sobrancelhas e Micropigmentação', '5583900000000')")
        mailton_id = cursor.lastrowid
        
        servicos = [
            (mailton_id, 'Design de Sobrancelha', 30, 35.00),
            (mailton_id, 'Micropigmentação', 90, 250.00),
            (mailton_id, 'Retoque / Manutenção', 45, 100.00)
        ]
        cursor.executemany("INSERT INTO servicos (profissional_id, nome, duracao_minutos, valor) VALUES (?, ?, ?, ?)", servicos)
        print("Banco de dados criado e dados do Mailton inseridos com sucesso!")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    criar_banco()
