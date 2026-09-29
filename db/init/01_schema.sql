/* Base de validacao: uma linha por e-mail x empresa x base de origem. */
CREATE TABLE cadastros (
    id                BIGSERIAL PRIMARY KEY,
    base              TEXT NOT NULL,                         /* MG0, MG1, ES, UDI... (arquivo de origem) */
    tipo              TEXT NOT NULL CHECK (tipo IN ('usuario', 'filial')),
    nome_usuario      TEXT,                                  /* texto entre parenteses da coluna Origem */
    email             TEXT NOT NULL,
    email_normalizado TEXT GENERATED ALWAYS AS (lower(btrim(email))) STORED,
    cnpj              VARCHAR(14),
    conta_fortes      TEXT,
    telefone          TEXT,
    razao_social      TEXT,
    nome_fantasia     TEXT
);
CREATE INDEX ix_cadastros_email ON cadastros (email_normalizado);
CREATE INDEX ix_cadastros_cnpj  ON cadastros (cnpj);
CREATE INDEX ix_cadastros_conta ON cadastros (conta_fortes);

/* Resultado de cada consulta feita na tela do usuario. */
CREATE TABLE consultas (
    id              BIGSERIAL PRIMARY KEY,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    email_informado TEXT NOT NULL,
    cnpj_informado  VARCHAR(14) NOT NULL,
    resultado       TEXT NOT NULL CHECK (resultado IN
                      ('ja_cadastrado', 'cadastrado_outro_cnpj', 'nao_cadastrado', 'sem_contatos', 'cnpj_nao_encontrado')),
    razao_social    TEXT,
    qtd_contatos    INTEGER NOT NULL DEFAULT 0,
    ip              TEXT,
    user_agent      TEXT
);
CREATE INDEX ix_consultas_criado_em ON consultas (criado_em DESC);
