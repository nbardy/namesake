module Types exposing (..)

import Window
import Time


type alias Pos =
    ( Int, Int )


type alias Config =
    { padding : Int
    , size : Int
    }


type Background
    = Rainbow
    | NGon
    | Spinners
    | Stars
    | Perspective


type alias Model =
    { mouse : Pos
    , config : Config
    , background : Background
    , windowSize : Window.Size
    , t : Time.Time
    , popup : Bool
    }
