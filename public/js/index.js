/* global fetch */

let boardAlights;

async function getBoardAlights() {
  boardAlights = await fetch('/api/routes').then(response => response.json());

  console.log(boardAlights);
}

getBoardAlights();
