const PORTAL_URL = "https://login.avancoinfo.com.br/";

const $ = (id) => document.getElementById(id);
const form = $("form");
const inEmail = $("email");
const inCnpj = $("cnpj");
const botao = $("enviar");
const caixa = $("resultado");

/* Elemento auxiliar: monta DOM sem innerHTML, evitando injecao de texto vindo do servidor. */
function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const f of filhos) n.append(f);
  return n;
}

function linkPortal(texto = "Portal do Cliente") {
  return el("a", { href: PORTAL_URL, target: "_blank", rel: "noopener noreferrer", textContent: texto });
}

function icone(nome) {
  const s = el("span", { className: "icon", textContent: nome });
  s.setAttribute("aria-hidden", "true");
  return s;
}

function botaoPortal() {
  return el("a", {
    href: PORTAL_URL, target: "_blank", rel: "noopener noreferrer", className: "botao primario"
  }, icone("open_in_new"), "Acessar o Portal do Cliente");
}

function botaoNova() {
  const b = el("button", { type: "button", className: "botao secundario" }, icone("refresh"), "Fazer nova consulta");
  b.addEventListener("click", reiniciar);
  return b;
}

/* Mascara de CNPJ enquanto digita */
inCnpj.addEventListener("input", () => {
  const d = inCnpj.value.replace(/\D/g, "").slice(0, 14);
  inCnpj.value = d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
  limparErro("cnpj");
});
inEmail.addEventListener("input", () => limparErro("email"));

function erroCampo(campo, msg) {
  $("erro-" + campo).textContent = msg;
  $(campo).classList.add("invalido");
}
function limparErro(campo) {
  $("erro-" + campo).textContent = "";
  $(campo).classList.remove("invalido");
}

function validar() {
  let ok = true;
  const email = inEmail.value.trim();
  const cnpj = inCnpj.value.replace(/\D/g, "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    erroCampo("email", "Digite um e-mail completo, por exemplo: nome@empresa.com.br.");
    ok = false;
  }
  if (cnpj.length !== 14) {
    erroCampo("cnpj", "O CNPJ precisa ter 14 números. Confira se digitou todos.");
    ok = false;
  }
  return ok;
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!validar()) return;

  botao.disabled = true;
  botao.classList.add("ocupado");
  caixa.hidden = true;

  try {
    const resp = await fetch("/api/verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inEmail.value.trim(), cnpj: inCnpj.value })
    });
    if (resp.status === 429) {
      return mostrar("erro-caixa", "Muitas tentativas em pouco tempo",
        [el("p", { textContent: "Por segurança, limitamos o número de consultas. Aguarde cerca de 1 minuto e tente novamente." })]);
    }
    const dados = await resp.json();
    if (!resp.ok) {
      return mostrar("erro-caixa", "Não foi possível consultar", [el("p", { textContent: dados.erro || "Verifique os dados informados." })]);
    }
    renderizar(dados);
  } catch {
    mostrar("erro-caixa", "Não foi possível concluir a consulta",
      [el("p", { textContent: "Ocorreu uma falha de conexão. Verifique sua internet e tente novamente em instantes." })]);
  } finally {
    botao.disabled = false;
    botao.classList.remove("ocupado");
  }
});

function renderizar(d) {
  switch (d.resultado) {
    case "ja_cadastrado":
      return mostrar("sucesso", "Boas notícias: seu e-mail já está cadastrado!", [
        el("p", {}, "O e-mail ", el("strong", { textContent: d.email }),
          " já possui acesso ao ", linkPortal(), ". Você não precisa fazer um novo cadastro."),
        el("p", { textContent: "Veja como entrar:" }),
        el("ol", {},
          el("li", {}, "Clique no botão ", el("strong", { textContent: "Acessar o Portal do Cliente" }), " abaixo."),
          el("li", { textContent: "Digite seu e-mail e sua senha e clique em Entrar." }),
          el("li", {}, "Se não lembrar da senha, clique em ", el("strong", { textContent: "“Esqueci minha senha”" }),
            ", digite seu e-mail e confirme. Você receberá uma mensagem com um link para criar uma nova senha."),
          el("li", { textContent: "Não encontrou a mensagem? Aguarde alguns minutos e confira também a caixa de spam ou lixo eletrônico." })),
        el("p", { textContent: "Aproveite para acessar agora mesmo e testar o seu login." }),
        el("div", { className: "acoes" }, botaoPortal(), botaoNova())
      ]);

    case "cadastrado_outro_cnpj": {
      const lista = el("ul", { className: "contatos" });
      for (const e of d.outrasEmpresas) {
        lista.append(el("li", {},
          el("span", { className: "avatar", textContent: e.razaoSocial.trim().charAt(0).toUpperCase() }),
          el("div", {},
            el("div", { className: "nome", textContent: e.razaoSocial }),
            el("div", { className: "mail", textContent: e.cnpj ? "CNPJ " + formatarCnpj(e.cnpj) : "CNPJ não informado no cadastro" }))));
      }
      const plural = d.outrasEmpresas.length > 1;
      return mostrar("atencao", "Seu usuário não está vinculado a este CNPJ", [
        el("p", {}, "Não encontramos o seu usuário para o CNPJ informado (", el("strong", { textContent: inCnpj.value }),
          "). Porém, o e-mail ", el("strong", { textContent: d.email }),
          plural ? " está cadastrado para as seguintes empresas:" : " está cadastrado para a seguinte empresa:"),
        lista,
        el("p", { textContent: "O que fazer agora:" }),
        el("ol", {},
          el("li", { textContent: "Se você digitou o CNPJ errado, faça uma nova consulta com o CNPJ correto." }),
          el("li", {}, "Se você trabalha na empresa listada acima, acesse o ", linkPortal(), " normalmente com este e-mail."),
          el("li", { textContent: "Se você também precisa de acesso à empresa que informou, peça a um colega dela que já tenha acesso ao Portal para cadastrar o seu e-mail. Depois, consulte novamente." })),
        el("div", { className: "acoes" }, botaoPortal(), botaoNova())
      ]);
    }

    case "nao_cadastrado": {
      const lista = el("ul", { className: "contatos" });
      for (const c of d.contatos) {
        const titulo = c.nome || "Usuário da empresa";
        lista.append(el("li", {},
          el("span", { className: "avatar", textContent: titulo.trim().charAt(0).toUpperCase() }),
          el("div", {},
            el("div", { className: "nome", textContent: titulo }),
            el("div", { className: "mail", textContent: c.emailMascarado }))));
      }
      return mostrar("atencao", "Seu e-mail ainda não está cadastrado", [
        el("p", {}, "Não encontramos o e-mail ", el("strong", { textContent: d.email }),
          " entre os usuários da empresa ", el("strong", { textContent: d.empresa || "informada" }), "."),
        el("p", { textContent: "Isso é normal: o cadastro de novos usuários é feito pelas próprias pessoas da sua empresa que já têm acesso ao Portal do Cliente. A Avanço não cadastra usuários diretamente." }),
        el("p", { textContent: "O que fazer agora:" }),
        el("ol", {},
          el("li", { textContent: "Procure uma das pessoas abaixo, colegas da sua empresa que já possuem acesso." }),
          el("li", { textContent: "Peça que ela cadastre o seu e-mail no Portal do Cliente." }),
          el("li", { textContent: "Quando ela avisar que concluiu, volte a esta página e consulte novamente para confirmar." })),
        lista,
        el("p", { textContent: "Por segurança, exibimos apenas parte do e-mail de cada pessoa. Se precisar, pergunte internamente quem são elas." }),
        el("div", { className: "acoes" }, botaoNova())
      ]);
    }

    case "sem_contatos":
      return mostrar("atencao", "Encontramos sua empresa, mas ainda não há usuários cadastrados", [
        el("p", {}, "Localizamos a empresa ", el("strong", { textContent: d.empresa || "informada" }),
          ", mas ainda não existe nenhuma pessoa cadastrada para ela no Portal do Cliente."),
        el("p", { textContent: "Nesse caso, entre em contato com o suporte da Avanço informando o CNPJ e o seu e-mail para que possamos liberar o primeiro acesso." }),
        el("div", { className: "acoes" }, botaoNova())
      ]);

    default:
      return mostrar("erro-caixa", "Não localizamos este CNPJ", [
        el("p", { textContent: "O CNPJ informado não consta em nossos cadastros." }),
        el("ol", {},
          el("li", { textContent: "Confira se digitou os 14 números corretamente." }),
          el("li", { textContent: "Verifique se é o CNPJ da empresa que contratou nossos serviços, e não de outra unidade ou de outro parceiro." }),
          el("li", { textContent: "Se estiver correto e o erro continuar, entre em contato com o suporte da Avanço." })),
        el("div", { className: "acoes" }, botaoNova())
      ]);
  }
}

function formatarCnpj(c) {
  return c.length === 14
    ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : c;
}

function mostrar(classe, titulo, filhos) {
  caixa.className = "resultado " + classe;
  const nomeIcone = { sucesso: "check_circle", atencao: "info", "erro-caixa": "error_outline" }[classe];
  caixa.replaceChildren(
    el("div", { className: "cabecalho-resultado" }, icone(nomeIcone), el("h2", { textContent: titulo })),
    ...filhos);
  caixa.hidden = false;
  caixa.scrollIntoView({ behavior: "smooth", block: "nearest" });
  caixa.focus({ preventScroll: true });
}

function reiniciar() {
  caixa.hidden = true;
  form.reset();
  limparErro("email");
  limparErro("cnpj");
  inEmail.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
