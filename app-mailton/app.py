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

    horarios_expediente = ['09:00', '10:30', '14:00', '15:30', '17:00']
    
    conn = get_db_connection()
    
    ocupados = conn.execute(
        "SELECT strftime('%H:%M', data_hora) as hora FROM agendamentos WHERE date(data_hora) = ? AND status != 'cancelado'", 
        (data,)
    ).fetchall()
    conn.close()
    
    horarios_ocupados = [h['hora'] for h in ocupados]
    horarios_disponiveis = [h for h in horarios_expediente if h not in horarios_ocupados]
    
    return jsonify(horarios_disponiveis)

if __name__ == '__main__':
    print("Servidor do WN Beauty System a iniciar...")
    # O host='0.0.0.0' permite que o telemóvel acesse o servidor
    app.run(host='0.0.0.0', debug=True, port=5000)

# --- ROTA 4: Painel Administrativo (Finanças e Lista de Agendamentos) ---
@app.route('/api/admin/dashboard', methods=['GET'])
def admin_dashboard():
    conn = get_db_connection()
    
    # Puxa todos os agendamentos cruzando dados do cliente e valor do serviço
    query = '''
        SELECT a.id, c.nome as cliente, c.telefone, s.nome as servico, 
               s.valor, a.data_hora, a.status 
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN servicos s ON a.servico_id = s.id
        ORDER BY a.data_hora DESC
    '''
    agendamentos = conn.execute(query).fetchall()
    
    # Calcula a receita total de agendamentos válidos (não cancelados)
    receita_total = sum([ag['valor'] for ag in agendamentos if ag['status'] != 'cancelado'])
    
    conn.close()
    return jsonify({
        "receita_total": receita_total,
        "agendamentos": [dict(ag) for ag in agendamentos]
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
