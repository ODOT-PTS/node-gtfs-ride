let boardAlights;

async function getBoardAlights() {
  boardAlights = await fetch('/api/routes').then(res => res.json());

  console.log(boardAlights);
}

getBoardAlights();
