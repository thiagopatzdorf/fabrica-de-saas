// Enumerações do motor de treino que o ESQUEMA precisa (por isso entram na carga inicial do app, limitada a
// 120 KB). O catálogo inteiro (nomes, músculos, ids) vive em catalogo.mjs e só carrega com a tela de treino:
// a conferência de "este exercício existe" é `exerciciosOrfaos` (catalogo.mjs), usada pela tela e pelos testes.
export const GRUPOS = ["peito", "costas", "ombros", "biceps", "triceps", "antebracos", "quadriceps", "posteriores", "gluteos", "panturrilhas", "core"];
export const EQUIPAMENTOS = ["barra", "halteres", "maquina", "cabo", "peso_corporal", "kettlebell", "elastico"];
export const PADROES = ["empurrar_h", "empurrar_v", "puxar_h", "puxar_v", "agachar", "dobrar_quadril", "avanco", "isolar", "core", "carregar"];
export const MODALIDADES = ["corrida", "caminhada", "bicicleta", "remo", "eliptico", "natacao", "outro"];
