import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';

const fastify = Fastify();
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgres://postgres:senai@localhost:5432/familia'
});

await fastify.register(cors, {
    origin: '*'
});

fastify.get('/formularios', async (request, reply) => {
    const result = await pool.query('SELECT * FROM formulario');
    return result.rows;
});

fastify.get('/formularios/:id/questoes', async (request, reply) => {
    const { id } = request.params;
    const result = await pool.query(
        'SELECT id, enunciado, opcao_a, opcao_b, opcao_c, opcao_d, peso FROM questoes WHERE formulario_id = $1',
        [id]
    );
    return result.rows;
});

fastify.post('/resultados', async (request, reply) => {
    const { formulario_id, nome_usuario, respostas } = request.body;

    try {
        const formularioExiste = await pool.query('SELECT id FROM formulario WHERE id = $1', [formulario_id]);
        
        if (formularioExiste.rowCount === 0) {
            return reply.status(404).send({ error: 'Formulário não encontrado' });
        }

        const questoesQuery = await pool.query(
            'SELECT id, resposta_correta, peso FROM questoes WHERE formulario_id = $1',
            [formulario_id]
        );

        const questoesNoBanco = questoesQuery.rows;
        let notaFinal = 0;

        questoesNoBanco.forEach(questao => {
            const respostaUsuario = respostas.find(r => r.questao_id === questao.id);
            if (respostaUsuario && respostaUsuario.opcao === questao.resposta_correta) {
                notaFinal += questao.peso;
            }
        });

        await pool.query(
            'INSERT INTO resultados (formulario_id, nome_usuario, nota) VALUES ($1, $2, $3)',
            [formulario_id, nome_usuario, notaFinal]
        );

        return { nome_usuario, nota: notaFinal };

    } catch (err) {
        if (err.code === '23503') {
            return reply.status(400).send({ error: 'ID de formulário inválido' });
        }
        return reply.status(500).send({ error: 'Erro interno no servidor' });
    }
});

fastify.get('/formularios/:id/ranking', async (request, reply) => {
    const { id } = request.params;
    const result = await pool.query(
        'SELECT nome_usuario, nota FROM resultados WHERE formulario_id = $1 ORDER BY nota DESC, data_criacao ASC LIMIT 10',
        [id]
    );
    return result.rows;
});

const start = async () => {
    try {
        await fastify.listen({ port: 3000 });
        console.log('Server running at http://localhost:3000');
    } catch (err) {
        process.exit(1);
    }
};

start();