COPY cadastros (base, tipo, nome_usuario, email, cnpj, conta_fortes, telefone, razao_social, nome_fantasia)
FROM '/seed/cadastros.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

UPDATE cadastros SET nome_usuario = NULLIF(nome_usuario, ''), cnpj = NULLIF(cnpj, ''),
    conta_fortes = NULLIF(conta_fortes, ''), telefone = NULLIF(telefone, ''),
    razao_social = NULLIF(razao_social, ''), nome_fantasia = NULLIF(nome_fantasia, '');
