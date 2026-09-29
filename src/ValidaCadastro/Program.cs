using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(NpgsqlDataSource.Create(
    builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("ConnectionStrings:Postgres nao configurada.")));

// Limita consultas por IP: a tela revela se um e-mail existe, entao evitamos varredura em massa.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("verificar", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(1) }));
});

// Atras do proxy do Dokploy (Traefik): usa o IP real do visitante no limite por IP e nos registros.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();
app.UseForwardedHeaders();
app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/saude", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/verificar", async (VerificarRequest req, NpgsqlDataSource db, HttpContext http, CancellationToken ct) =>
{
    var email = (req.Email ?? "").Trim().ToLowerInvariant();
    var cnpj = Regex.Replace(req.Cnpj ?? "", @"\D", "");

    if (!Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$") || email.Length > 254)
        return Results.BadRequest(new { erro = "Informe um e-mail válido, por exemplo: nome@empresa.com.br." });
    if (cnpj.Length != 14)
        return Results.BadRequest(new { erro = "O CNPJ deve ter 14 números." });

    await using var conn = await db.OpenConnectionAsync(ct);

    // 1) Empresa informada: dados e contas vinculadas ao CNPJ
    string? razao = null, fantasia = null;
    var contas = new List<string>();
    await using (var cmd = new NpgsqlCommand(
        "SELECT razao_social, nome_fantasia, conta_fortes FROM cadastros WHERE cnpj = @c", conn))
    {
        cmd.Parameters.AddWithValue("c", cnpj);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
        {
            razao ??= rd.IsDBNull(0) ? null : rd.GetString(0);
            fantasia ??= rd.IsDBNull(1) ? null : rd.GetString(1);
            if (!rd.IsDBNull(2) && !contas.Contains(rd.GetString(2))) contas.Add(rd.GetString(2));
        }
    }
    var empresaExiste = razao is not null || fantasia is not null || contas.Count > 0;

    // 2) Onde este e-mail e usuario? (linhas 'filial' sao e-mails de contato, nao usuarios do Portal)
    var vinculos = new List<Vinculo>();
    await using (var cmd = new NpgsqlCommand(
        @"SELECT DISTINCT COALESCE(u.cnpj, c.cnpj), COALESCE(u.razao_social, c.razao_social),
                 COALESCE(u.nome_fantasia, c.nome_fantasia), u.conta_fortes
          FROM cadastros u
          LEFT JOIN LATERAL (SELECT x.cnpj, x.razao_social, x.nome_fantasia FROM cadastros x
                             WHERE x.conta_fortes = u.conta_fortes AND x.cnpj IS NOT NULL LIMIT 1) c ON u.cnpj IS NULL
          WHERE u.email_normalizado = @e AND u.tipo = 'usuario'", conn))
    {
        cmd.Parameters.AddWithValue("e", email);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
            vinculos.Add(new Vinculo(
                rd.IsDBNull(0) ? null : rd.GetString(0),
                rd.IsDBNull(1) ? null : rd.GetString(1),
                rd.IsDBNull(2) ? null : rd.GetString(2),
                rd.IsDBNull(3) ? null : rd.GetString(3)));
    }

    var contatos = new List<Contato>();
    var outrasEmpresas = new List<EmpresaVinculada>();
    string resultado;

    if (vinculos.Any(v => v.Cnpj == cnpj || (v.Conta is not null && contas.Contains(v.Conta))))
    {
        resultado = "ja_cadastrado";
    }
    else if (vinculos.Count > 0)
    {
        // Usuario existe, mas nao para o CNPJ informado: mostramos em quais empresas ele esta cadastrado.
        resultado = "cadastrado_outro_cnpj";
        outrasEmpresas = vinculos
            .GroupBy(v => v.Cnpj ?? "conta:" + v.Conta)
            .Select(g => g.First())
            .Select(v => new EmpresaVinculada(v.Cnpj, v.Razao ?? v.Fantasia ?? "Empresa sem nome cadastrado"))
            .OrderBy(e => e.RazaoSocial, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }
    else if (!empresaExiste)
    {
        resultado = "cnpj_nao_encontrado";
    }
    else
    {
        // Usuarios da empresa: pelo CNPJ ou pela conta (alguns usuarios so possuem a conta preenchida)
        await using var cmd = new NpgsqlCommand(
            @"SELECT DISTINCT ON (email_normalizado) nome_usuario, email_normalizado
              FROM cadastros
              WHERE tipo = 'usuario' AND (cnpj = @c OR conta_fortes = ANY(@contas))
              ORDER BY email_normalizado", conn);
        cmd.Parameters.AddWithValue("c", cnpj);
        cmd.Parameters.AddWithValue("contas", contas.ToArray());
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
        {
            var nome = rd.IsDBNull(0) ? "" : rd.GetString(0).Trim();
            var mail = rd.GetString(1);
            // Nao expomos e-mail completo a quem ainda nao esta identificado.
            contatos.Add(new Contato(nome.Contains('@') ? "" : nome, MascararEmail(mail)));
        }
        contatos = contatos.OrderBy(c => c.Nome == "").ThenBy(c => c.Nome, StringComparer.CurrentCultureIgnoreCase).ToList();
        resultado = contatos.Count > 0 ? "nao_cadastrado" : "sem_contatos";
    }

    await using (var log = new NpgsqlCommand(
        @"INSERT INTO consultas (email_informado, cnpj_informado, resultado, razao_social, qtd_contatos, ip, user_agent)
          VALUES (@e, @c, @r, @rs, @q, @ip, @ua)", conn))
    {
        log.Parameters.AddWithValue("e", email);
        log.Parameters.AddWithValue("c", cnpj);
        log.Parameters.AddWithValue("r", resultado);
        log.Parameters.AddWithValue("rs", (object?)razao ?? DBNull.Value);
        log.Parameters.AddWithValue("q", contatos.Count + outrasEmpresas.Count);
        log.Parameters.AddWithValue("ip", (object?)http.Connection.RemoteIpAddress?.ToString() ?? DBNull.Value);
        log.Parameters.AddWithValue("ua", (object?)http.Request.Headers.UserAgent.ToString() ?? DBNull.Value);
        await log.ExecuteNonQueryAsync(ct);
    }

    return Results.Ok(new { resultado, email, empresa = razao ?? fantasia, contatos, outrasEmpresas });
}).RequireRateLimiting("verificar");

app.Run();

static string MascararEmail(string email)
{
    var i = email.IndexOf('@');
    if (i <= 1) return email;
    var local = email[..i];
    var visivel = Math.Min(2, local.Length);
    return local[..visivel] + new string('*', Math.Max(3, local.Length - visivel)) + email[i..];
}

record VerificarRequest(string? Email, string? Cnpj);
record Vinculo(string? Cnpj, string? Razao, string? Fantasia, string? Conta);
record EmpresaVinculada(string? Cnpj, string RazaoSocial);
record Contato(string Nome, string EmailMascarado);
