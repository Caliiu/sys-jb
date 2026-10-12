Use subagentes para preservar o contexto da sessão principal.

Mantenha a sessão principal responsável por coordenar o trabalho,
tomar decisões e integrar os resultados.

Delegue aos subagentes tarefas que envolvam muita exploração,
leitura de arquivos, investigação de erros e execução de testes.

Para cada tarefa delegada:
- Defina um objetivo específico e forneça o contexto necessário.
- Peça que o subagente faça as leituras e análises no próprio contexto.
- Solicite uma resposta curta contendo: conclusão, arquivos relevantes,
  alterações realizadas, testes executados e pendências.
- Evite trazer arquivos completos, logs extensos ou transcrições
  para a sessão principal.
- Consulte detalhes adicionais somente quando forem necessários
  para decidir ou verificar o resultado.

Execute em paralelo apenas tarefas independentes.
Evite que dois subagentes editem os mesmos arquivos simultaneamente.
Resolva tarefas pequenas diretamente, sem delegação desnecessária.

Aplique esse fluxo à tarefa atual.