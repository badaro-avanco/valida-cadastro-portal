# Consulta de Cadastro (Portal do Cliente)

Tela para o cliente informar e-mail e CNPJ e descobrir se já tem acesso ao Portal do Cliente.
Stack: C# (ASP.NET Core 8) + HTML/CSS/JavaScript + PostgreSQL 16.

## Rodar localmente

Requer apenas Docker Desktop.

1. `pip install openpyxl` e `python tools/gerar_seed.py` (gera `db/seed/cadastros.csv` a partir das planilhas `*_empresas_emails_telefones.xlsx` da raiz).
2. `docker compose up -d --build`
3. Abrir http://localhost:8090

O banco fica exposto em `localhost:5434` (usuário `valida`, senha `valida_dev`, banco `valida_cadastro`).

Para recarregar as planilhas do zero: `docker compose down -v` e repetir os passos 1 e 2.

## Banco de dados

- `cadastros`: base única (nome_usuario, email, cnpj, conta_fortes, telefone, razao_social, nome_fantasia, tipo, base).
- `consultas`: resultado de cada consulta feita na tela (e-mail, CNPJ, resultado, empresa, IP, data).

Exemplo de relatório: `SELECT resultado, count(*) FROM consultas GROUP BY 1;`

## Regras

- E-mail existe como `usuario` em qualquer empresa: mensagem de "já cadastrado" com link do Portal.
- Não existe: lista os usuários do CNPJ informado (e-mail parcialmente oculto).
- Linhas com origem `filial` são e-mails de contato da empresa e não contam como usuário do Portal.
- Limite de 15 consultas por minuto por IP.

## Antes de publicar

- As planilhas e o CSV têm dados de clientes e estão no `.gitignore`. Não os suba para o Git; carregue-os direto no banco de produção.
- Trocar a senha do banco (variável `DB_PASSWORD`).
- Atrás de proxy/HTTPS, configurar `ForwardedHeaders` para o limite por IP enxergar o IP real.
