// A board: a place, and whether it is ridden on the moon (where he hangs
// in the air longer: see air_pace, in programs/skate/slope.l8), as one
// number. Scores, best lines, shared runs and replays are each of a board,
// and the page, the leaderboards' worker and the game all number boards
// alike (the game: see board_of, in programs/skate/layout.l8).
//
// On the earth a board is its place's own number (a course's, or a
// park's, negative); on the moon, that moved MOON_BOARD further from 0:
// Haystack on the moon is 1000000001, and park 2 there -1000000002. (Every
// place's number is less than MOON_BOARD from 0.)
export const MOON_BOARD = 1000000000;

export const boardOf = (place, moon) => (moon ? Math.sign(place) * (MOON_BOARD + Math.abs(place)) : place);
export const placeOfBoard = (board) => Math.sign(board) * (Math.abs(board) % MOON_BOARD);
export const onMoon = (board) => Math.abs(board) >= MOON_BOARD;
