import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';

const fastify = Fastify({ logger: true });

// Configurando CORS para permitir requisições do frontend
await fastify.register(cors, { origin: '*' });

// Configurando a conexão com o PostgreSQL
const pool = new pg.Pool({
    user: 'postgres',
    password: 'senai',
    host: 'localhost',
    port: 5432,
    database: 'familia'
});

// ==========================================
// ROTAS DO SISTEMA
// ==========================================

// 1. Criar um novo formulário
fastify.post('/formularios', async (request, reply) => {
    const { nome } = request.body;
    const result = await pool.query(
        'INSERT INTO formularios (nome) VALUES ($1) RETURNING *',
        [nome]
    );
    return reply.code(201).send(result.rows[0]);
});

// 2. Listar formulários
fastify.get('/formularios', async (request, reply) => {
    const result = await pool.query('SELECT * FROM formularios ORDER BY id ASC');
    return reply.send(result.rows);
});

// 3. Criar uma questão com alternativas para um formulário específico
fastify.post('/formularios/:id/questoes', async (request, reply) => {
    const { id } = request.params;
    const { texto, alternativas } = request.body;

    // Salva a questão
    const questaoResult = await pool.query(
        'INSERT INTO questoes (formulario_id, texto) VALUES ($1, $2) RETURNING *',
        [id, texto]
    );
    const questaoId = questaoResult.rows[0].id;

    // Salva as alternativas vinculadas a ela
    const alternativasInseridas = [];
    for (const alt of alternativas) {
        const altResult = await pool.query(
            'INSERT INTO alternativas (questao_id, letra, texto, correta) VALUES ($1, $2, $3, $4) RETURNING *',
            [questaoId, alt.letra, alt.texto, alt.correta]
        );
        alternativasInseridas.push(altResult.rows[0]);
    }

    return reply.code(201).send({
        ...questaoResult.rows[0],
        alternativas: alternativasInseridas
    });
});

// 4. Listar todas as questões de um formulário (traz as alternativas juntas)
fastify.get('/formularios/:id/questoes', async (request, reply) => {
    const { id } = request.params;

    const questoesResult = await pool.query('SELECT * FROM questoes WHERE formulario_id = $1', [id]);
    const alternativasResult = await pool.query(
        'SELECT * FROM alternativas WHERE questao_id IN (SELECT id FROM questoes WHERE formulario_id = $1)',
        [id]
    );

    // Mapeamento didático: Agrupa cada alternativa na sua respectiva questão
    const questoesCompletas = questoesResult.rows.map(questao => {
        return {
            ...questao,
            alternativas: alternativasResult.rows.filter(alt => alt.questao_id === questao.id)
        };
    });

    return reply.send(questoesCompletas);
});

// 5. Responder o formulário (Cria uma tentativa, salva as respostas e calcula a pontuação)
fastify.post('/formularios/:id/tentativas', async (request, reply) => {
    const { id } = request.params;
    const { nome_responsavel, respostas } = request.body;

    // Cria a tentativa inicial (pontuação começa em zero)
    const tentativaResult = await pool.query(
        'INSERT INTO tentativas (formulario_id, nome_responsavel, pontuacao) VALUES ($1, $2, 0) RETURNING *',
        [id, nome_responsavel]
    );
    const tentativaId = tentativaResult.rows[0].id;

    let pontuacaoCalculada = 0;

    // Processa cada resposta recebida (usando 'for...of' para respeitar o await)
    for (const resposta of respostas) {
        // Verifica no banco se a alternativa escolhida era a correta
        const altResult = await pool.query(
            'SELECT correta FROM alternativas WHERE id = $1',
            [resposta.alternativa_id]
        );
        const alternativaSelecionada = altResult.rows[0];

        if (alternativaSelecionada && alternativaSelecionada.correta) {
            pontuacaoCalculada++;
        }

        // Registra qual foi a escolha para auditoria
        await pool.query(
            'INSERT INTO respostas (tentativa_id, questao_id, alternativa_id) VALUES ($1, $2, $3)',
            [tentativaId, resposta.questao_id, resposta.alternativa_id]
        );
    }

    // Atualiza a tentativa com o número de acertos finais
    const tentativaFinalResult = await pool.query(
        'UPDATE tentativas SET pontuacao = $1 WHERE id = $2 RETURNING *',
        [pontuacaoCalculada, tentativaId]
    );

    return reply.code(201).send(tentativaFinalResult.rows[0]);
});

// 6. Exibir ranking ordenado pelo maior número de acertos
fastify.get('/formularios/:id/ranking', async (request, reply) => {
    const { id } = request.params;
    
    const rankingResult = await pool.query(
        'SELECT nome_responsavel, pontuacao FROM tentativas WHERE formulario_id = $1 ORDER BY pontuacao DESC',
        [id]
    );

    return reply.send(rankingResult.rows);
});

// Iniciando o servidor
await fastify.listen({ port: 3000, host: '0.0.0.0' });
console.log('Servidor rodando na porta 3000 🚀');