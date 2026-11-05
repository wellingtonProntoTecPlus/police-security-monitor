# Clientes: documento, sede da parceira e filtro de status

## Um cliente, vários sistemas

O mesmo cadastro de cliente pode estar vinculado a várias centrais de alarme. Para outro sistema da mesma pessoa ou empresa, utilize o cliente já cadastrado ao cadastrar a central. Isso preserva um único CPF/CNPJ do cliente, mas mantém cada sistema, conta e identidade física separados.

A confirmação de CNPJ não libera cadastros de terceiros com o mesmo documento. Não se altera a identificação física dos painéis e nenhuma transmissão é executada por este fluxo.

## Parceira como cliente da própria sede

Ao informar no cadastro do cliente o CNPJ da empresa parceira selecionada, o sistema apresenta **“CNPJ CADASTRADO. DESEJA CONTINUAR?”**. Se confirmado, carrega os dados disponíveis da parceira nos campos ainda vazios e identifica o cliente como PJ/empresa, vinculado àquela mesma parceira. Os dados devem ser conferidos antes de salvar.

A exceção exige confirmação explícita, cliente PJ classificado como empresa e coincidência do CNPJ com a própria parceira selecionada. O servidor confere tudo novamente. Pode existir uma reserva documental como parceira e uma como sua sede cliente, mas não duas parceiras ou dois clientes com o mesmo documento. A sede é marcada pelo servidor; não basta enviar esse marcador pela interface/API.

Criação e reserva documental são transacionais. Uma duplicidade ou falha não deixa cliente/parceira parcialmente cadastrados. O índice documental mantém unicidade por categoria; o lock do documento e a conferência de titulares impedem que a divisão por categoria autorize reutilização indevida. A edição da parceira que já monitora sua sede continua permitida com o mesmo CNPJ.

## Filtrar situação de monitoramento

Na tela **Clientes Monitorados**, o filtro **Status** possui Todos, Ativo, Suspenso e Bloqueado. Pode ser combinado com busca por nome, conta, documento e empresa parceira. O filtro é aplicado no banco e conferido pela interface.

Uma suspensão com prazo vencido aparece como **Ativo**, seguindo a mesma regra efetiva do receptor e da lista operacional. Bloqueado é o bloqueio administrativo, não a ausência de conexão do painel. O filtro não modifica o estado nem apaga eventos ou atendimentos existentes.

## Implantação

O upgrade VPS adiciona o marcador de sede e migra a unicidade documental de forma repetível, criando a chave nova antes de retirar a antiga. Não apaga cadastros, nem marca sedes históricas automaticamente, nem altera configurações ViaWeb. O código precisa ser aplicado na VPS antes de usar as novas opções em produção.
