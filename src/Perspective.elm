module Perspective exposing (renderPerspective)

import Collage
import DrawingUtilities exposing (tween, colorFromRainbow, gridPoints, fillBackground, tween)
import Color exposing (Color)
import Types exposing (..)
import Debug exposing (log)


renderPerspective : Model -> Collage.Form
renderPerspective model =
    List.range 1 24
        |> List.map toFloat
        |> List.map ((*) (1 / 24))
        |> List.reverse
        |> List.map (renderSquare model)
        |> Collage.group


renderSquare : Model -> Float -> Collage.Form
renderSquare model size =
    let
        ( mouseRow, mouseCol ) =
            model.mouse

        color =
            (colorFromRainbow 2.9 size)

        { width, height } =
            model.windowSize

        rate =
            1

        powa =
            0.69

        row =
            tween ( toFloat mouseRow, 0 ) (((size / rate) ^ powa))

        col =
            tween ( toFloat mouseCol, 0 ) (((size / rate) ^ powa))
    in
        Collage.rect (toFloat width * size) (toFloat height * size)
            |> Collage.filled color
            |> Collage.move ( row, col )
