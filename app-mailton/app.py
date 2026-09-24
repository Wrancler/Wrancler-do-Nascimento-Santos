from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import uuid

app = Flask(__name__)
# Permite que o front-end em HTML comunique com esta API sem bloqueios
CORS(app) 

def get_db_connection():
    conn = sqlite3.connect('wn_beauty_system.db')
    conn.row_factory = sqlite3.Row # Permite aceder às colunas pelo nome (ex: linha['nome'])
    return conn

# --- ROTA 1: Enviar os serviços para o HTML ---
@app.route('/api/servicos', methods=['GET'])
def listar_servicos():
    conn = get_db_connection()
    # Puxa os serviços do profissional de ID 1 (Mailton)
    servicos = conn.execute('SELECT id, nome, duracao_minutos, valor FROM servicos WHERE profissional_id = 1').fetchall()
    conn.close()
    
    # Converte os resultados para um formato que o JavaScript entende (JSON)
    return jsonify([dict(servico) for servico in servicos])

# --- ROTA 2: Receber e gravar o agendamento ---
@app.route('/api/agendar', methods=['POST'])
def criar_agendamento():
    dados = request.json
    
    # Extrai os dados enviados pelo cliente no site
    nome_cliente = dados.get('nome_cliente')
    telefone_cliente = dados.get('telefone_cliente')
    servico_id = dados.get('servico_id')
    data_hora = dados.get('data_hora') # Formato esperado: YYYY-MM-DD HH:MM
    
    if not all([nome_cliente, telefone_cliente, servico_id, data_hora]):
        return jsonify({"erro": "Faltam dados obrigatórios"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Verifica se o cliente já existe pelo telefone. Se não, regista-o.
    cursor.execute("SELECT id FROM clientes WHERE telefone = ?", (telefone_cliente,))
    cliente = cursor.fetchone()
    
    if cliente:
        cliente_id = cliente['id']
    else:
        cursor.execute("INSERT INTO clientes (nome, telefone) VALUES (?, ?)", (nome_cliente, telefone_cliente))
        cliente_id = cursor.lastrowid
        
    # 2. Gera o token único e seguro para o link de cancelamento
    token = str(uuid.uuid4())
    
    # 3. Regista o agendamento oficial
    cursor.execute(
        "INSERT INTO agendamentos (cliente_id, servico_id, data_hora, token_cancelamento) VALUES (?, ?, ?, ?)",
        (cliente_id, servico_id, data_hora, token)
    )
    
    conn.commit()
    conn.close()
    
    # Retorna sucesso e envia o token de volta (útil para testes)
    return jsonify({
        "mensagem": "Agendamento confirmado com sucesso!", 
        "token_cancelamento": token
    }), 201

if __name__ == '__main__':
    # Inicia o servidor na porta 5000
    print("Servidor do WN Beauty System a iniciar...")
    app.run(debug=True, port=5000)
