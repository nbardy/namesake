module DrawingUtilities exposing (..)

import Collage
import Color exposing (Color)
import Types exposing (..)
import Window


sineWave : Float -> Float -> ( Float, Float ) -> Float -> Int
sineWave speed shift ( low, high ) n =
    let
        mid =
            (low + high) / 2
    in
        round (((sin (n * speed + (shift * 2 * pi)) * mid) + mid))


colorFromRainbow : Float -> Float -> Color.Color
colorFromRainbow freq n =
    Color.rgb
        (sineWave freq 0 ( 0, 255 ) n)
        (sineWave freq (1 / 3) ( 0, 255 ) n)
        (sineWave freq (2 / 3) ( 0, 255 ) n)


fillBackground windowSize color =
    Collage.rect
        (toFloat windowSize.width)
        (toFloat windowSize.height)
        |> Collage.filled color


gridPoints : Int -> Window.Size -> List Pos
gridPoints padding windowSize =
    let
        rows =
            (windowSize.width // padding) + 2

        cols =
            (windowSize.height // padding) + 2
    in
        List.range (-rows // 2) (rows // 2)
            |> List.concatMap
                (\row ->
                    (List.map (\col -> ( (padding * row), (padding * col) ))
                        (List.range (-cols // 2) (cols // 2))
                    )
                )


tween : ( Float, Float ) -> Float -> Float
tween ( v0, v1 ) p =
    v0 * (1 - p) + v1 * p
