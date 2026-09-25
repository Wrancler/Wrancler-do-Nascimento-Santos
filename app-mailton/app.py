from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import uuid

app = Flask(__name__)
# Permite que o front-end em HTML comunique com esta API sem bloqueios
CORS(app) 

def get_db_connection():
    conn = sqlite3.connect('wn_beauty_system.db')
    conn.row_factory = sqlite3.Row
    return conn

# --- ROTA 1: Enviar os serviços para o HTML ---
@app.route('/api/servicos', methods=['GET'])
def listar_servicos():
    conn = get_db_connection()
    servicos = conn.execute('SELECT id, nome, duracao_minutos, valor FROM servicos WHERE profissional_id = 1').fetchall()
    conn.close()
    return jsonify([dict(servico) for servico in servicos])

# --- ROTA 2: Receber e gravar o agendamento ---
@app.route('/api/agendar', methods=['POST'])
def criar_agendamento():
    dados = request.json
    
    nome_cliente = dados.get('nome_cliente')
    telefone_cliente = dados.get('telefone_cliente')
    servico_id = dados.get('servico_id')
    data_hora = dados.get('data_hora')
    
    if not all([nome_cliente, telefone_cliente, servico_id, data_hora]):
        return jsonify({"erro": "Faltam dados obrigatórios"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM clientes WHERE telefone = ?", (telefone_cliente,))
    cliente = cursor.fetchone()
    
    if cliente:
        cliente_id = cliente['id']
    else:
        cursor.execute("INSERT INTO clientes (nome, telefone) VALUES (?, ?)", (nome_cliente, telefone_cliente))
        cliente_id = cursor.lastrowid
        
    token = str(uuid.uuid4())
    
    cursor.execute(
        "INSERT INTO agendamentos (cliente_id, servico_id, data_hora, token_cancelamento) VALUES (?, ?, ?, ?)",
        (cliente_id, servico_id, data_hora, token)
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({
        "mensagem": "Agendamento confirmado com sucesso!", 
        "token_cancelamento": token
    }), 201

# --- ROTA 3: Buscar horários disponíveis na data escolhida ---
@app.route('/api/horarios', methods=['GET'])
def horarios_livres():
    data = request.args.get('data') 
    
    if not data:
        return jsonify({"erro": "Data não fornecida"}), 400

    # Tempo base de atendimento (isso poderá vir do banco futuramente)
    horarios_expediente = ['09:00', '10:30', '14:00', '15:30', '17:00']
    
    conn = get_db_connection()
    
    # 1. Verifica se o dia INTEIRO está bloqueado (hora_bloqueio IS NULL)
    dia_bloqueado = conn.execute(
        "SELECT id FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data,)
    ).fetchone()
    
    if dia_bloqueado:
        conn.close()
        return jsonify([]) # Retorna lista vazia, bloqueando o dia no front-end
        
    # 2. Busca horários específicos bloqueados pelo Mailton
    bloqueios_parciais = conn.execute(
        "SELECT hora_bloqueio FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NOT NULL", (data,)
    ).fetchall()
    horarios_bloqueados_admin = [b['hora_bloqueio'] for b in bloqueios_parciais]

    # 3. Busca horários já agendados por clientes
    ocupados = conn.execute(
        "SELECT strftime('%H:%M', data_hora) as hora FROM agendamentos WHERE date(data_hora) = ? AND status != 'cancelado'", 
        (data,)
    ).fetchall()
    horarios_ocupados_clientes = [h['hora'] for h in ocupados]
    
    conn.close()
    
    # Remove da lista os horários agendados e os bloqueados manualmente
    todos_indisponiveis = set(horarios_bloqueados_admin + horarios_ocupados_clientes)
    horarios_disponiveis = [h for h in horarios_expediente if h not in todos_indisponiveis]
    
    return jsonify(horarios_disponiveis)


# --- ROTA 4: Painel Administrativo (Finanças, Agenda e Meses) ---
@app.route('/api/admin/dashboard', methods=['GET'])
def admin_dashboard():
    conn = get_db_connection()
    
    # 1. Puxa os agendamentos e finanças
    query = '''
        SELECT a.id, c.nome as cliente, c.telefone, s.nome as servico, 
               s.valor, a.data_hora, a.status 
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN servicos s ON a.servico_id = s.id
        ORDER BY a.data_hora DESC
    '''
    agendamentos = conn.execute(query).fetchall()
    receita_total = sum([ag['valor'] for ag in agendamentos if ag['status'] != 'cancelado'])
    
    # 2. Puxa os meses que já foram configurados no banco
    meses = conn.execute('SELECT ano_mes, status FROM meses_abertos').fetchall()
    
    conn.close()
    return jsonify({
        "receita_total": receita_total,
        "agendamentos": [dict(ag) for ag in agendamentos],
        "meses": [dict(m) for m in meses]
    })

# --- ROTA 5: Abrir ou Fechar um Mês ---
@app.route('/api/admin/mes', methods=['POST'])
def alternar_mes():
    dados = request.json
    ano_mes = dados.get('ano_mes')
    status = dados.get('status') # 'aberto' ou 'fechado'
    
    conn = get_db_connection()
    # Atualiza ou insere o estado do mês
    conn.execute('''
        INSERT INTO meses_abertos (ano_mes, status) VALUES (?, ?)
        ON CONFLICT(ano_mes) DO UPDATE SET status = excluded.status
    ''', (ano_mes, status))
    conn.commit()
    conn.close()
    
    return jsonify({"mensagem": f"Mês {ano_mes} agora está {status}!"})

if __name__ == '__main__':
    print("Servidor do WN Beauty System a iniciar...")
    app.run(host='0.0.0.0', debug=True, port=5000)

    # --- ROTA 6: Listar bloqueios de um mês (Painel Admin) ---
@app.route('/api/admin/bloqueios/<ano_mes>', methods=['GET'])
def listar_bloqueios(ano_mes):
    conn = get_db_connection()
    # Busca bloqueios que começam com o ano e mês solicitados (ex: '2026-09')
    bloqueios = conn.execute(
        "SELECT * FROM bloqueios WHERE data_bloqueio LIKE ? ORDER BY data_bloqueio, hora_bloqueio", 
        (f"{ano_mes}%",)
    ).fetchall()
    conn.close()
    return jsonify([dict(b) for b in bloqueios])

# --- ROTA 7: Adicionar ou Remover Bloqueio ---
@app.route('/api/admin/bloquear', methods=['POST', 'DELETE'])
def gerenciar_bloqueio():
    dados = request.json
    data_bloqueio = dados.get('data_bloqueio')
    hora_bloqueio = dados.get('hora_bloqueio') # Opcional
    
    conn = get_db_connection()
    
    if request.method == 'POST':
        # Cria um novo bloqueio
        conn.execute(
            "INSERT INTO bloqueios (data_bloqueio, hora_bloqueio) VALUES (?, ?)",
            (data_bloqueio, hora_bloqueio)
        )
        mensagem = "Bloqueio registrado com sucesso."
    elif request.method == 'DELETE':
        # Remove um bloqueio existente
        if hora_bloqueio:
            conn.execute("DELETE FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio = ?", (data_bloqueio, hora_bloqueio))
        else:
            conn.execute("DELETE FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data_bloqueio,))
        mensagem = "Bloqueio removido."
        
    conn.commit()
    conn.close()
    return jsonify({"mensagem": mensagem})
